/**
 * An open host serial port. `rate` is the speed it should run at and
 * `openRate` the one it was opened with; they differ while a reopen is due.
 * `reader` and `writer` are null while the port opens, reopens, or closes,
 * and `pending` holds the writes made meanwhile. `ready` is the level wanted
 * on RTS and DTR. `busy` is set while an open or close is in flight, and
 * `closed` once the link is closed or has failed, with `closeDone` waiting
 * for the close to finish. `next` opens the next link on the same port once
 * this one has let go of it.
 *
 * @typedef {{
 *   port: SerialPort,
 *   rate: number,
 *   openRate: number,
 *   reader: ReadableStreamDefaultReader<Uint8Array> | null,
 *   writer: WritableStreamDefaultWriter<Uint8Array> | null,
 *   pending: Uint8Array[],
 *   ready: boolean,
 *   polling: boolean,
 *   busy: boolean,
 *   closed: boolean,
 *   closeDone: (function(string | null): void)[],
 *   next: (function(): void) | null,
 *   onData: function(Uint8Array): void,
 *   onClose: function(string): void,
 * }} Link
 */

/**
 * The last link opened on each port, until it has closed. A port can be
 * opened again while its previous link still closes.
 *
 * @type {Map<SerialPort, Link>}
 */
const portLinks = new Map();

/**
 * Explain why serial ports cannot be used here, or return "" when they can.
 * Chrome leaves `navigator.serial` out of pages that are not secure, so that
 * is checked first.
 *
 * @returns {string}
 */
export function availability() {
    if (!window.isSecureContext) {
        return "Web Serial needs a page served over https:// or from localhost.";
    }
    if (navigator.serial === undefined) {
        return "This browser has no Web Serial; use Chrome, Edge, or Opera.";
    }
    return "";
}

/**
 * Ask the user to choose a serial port; this must run from a click. A closed
 * chooser reports neither an error nor a port.
 *
 * @param {function(string | null, SerialPort | null): void} onDone
 */
export function request(onDone) {
    const serial = navigator.serial;
    if (serial === undefined) {
        onDone("This browser has no Web Serial.", null);
        return;
    }
    serial.requestPort().then(
        function (port) {
            onDone(null, port);
        },
        function (ex) {
            if (ex instanceof Error && ex.name === "NotFoundError") {
                onDone(null, null);
                return;
            }
            onDone(serialError("Could not choose a serial port", ex), null);
        },
    );
}

/**
 * A short name for a port: its USB vendor and product ids when it has them.
 *
 * @param {SerialPort} port
 * @returns {string}
 */
export function portName(port) {
    const info = port.getInfo();
    if (info.usbVendorId === undefined || info.usbProductId === undefined) {
        return "Serial port";
    }
    return "USB " + hex4(info.usbVendorId) + ":" + hex4(info.usbProductId);
}

/**
 * Open a port with 8 data bits, 2 stop bits, no parity, and no flow control,
 * as the QL does parity in software and its handshake lines are driven by
 * hand. An earlier link on the same port must close first, so this open
 * waits for it. Bytes read arrive through `onData`. A port that fails or is
 * unplugged later is closed and reported through `onClose`.
 *
 * @param {SerialPort} port
 * @param {number} rate
 * @param {function(Uint8Array): void} onData
 * @param {function(string): void} onClose
 * @param {function(string | null, Link | null): void} onDone
 */
export function open(port, rate, onData, onClose, onDone) {
    /** @type {Link} */
    const link = {
        port,
        rate,
        openRate: rate,
        reader: null,
        writer: null,
        pending: [],
        ready: false,
        polling: false,
        busy: true,
        closed: false,
        closeDone: [],
        next: null,
        onData,
        onClose,
    };
    const previous = portLinks.get(port);
    portLinks.set(port, link);
    if (previous === undefined) {
        start();
    } else {
        previous.next = start;
    }

    function start() {
        openPort(link, function (err) {
            if (err !== null) {
                link.closed = true;
                finishBusy(link, null);
                onDone(err, null);
                return;
            }
            link.busy = false;
            onDone(null, link);
        });
    }
}

/**
 * Send bytes in order; while the port reopens they wait for it.
 *
 * @param {Link} link
 * @param {Uint8Array} bytes
 */
export function write(link, bytes) {
    if (link.closed || bytes.length === 0) {
        return;
    }
    if (link.writer === null) {
        link.pending.push(bytes);
        return;
    }
    link.writer.write(bytes).then(
        function () {},
        function (ex) {
            fail(link, serialError("Could not write to the serial port", ex));
        },
    );
}

/**
 * Change the port's speed, reopening it once any open or close in flight
 * has finished.
 *
 * @param {Link} link
 * @param {number} rate
 */
export function setRate(link, rate) {
    link.rate = rate;
    if (!link.busy && !link.closed && link.openRate !== rate) {
        reopen(link);
    }
}

/**
 * Raise or drop RTS and DTR together to let the device send or hold it off.
 *
 * @param {Link} link
 * @param {boolean} ready
 */
export function setReady(link, ready) {
    if (link.ready === ready) {
        return;
    }
    link.ready = ready;
    sendSignals(link);
}

/**
 * Read CTS, the device's readiness to take data, unless a read is still out.
 *
 * @param {Link} link
 * @param {function(boolean): void} onSignals
 */
export function pollSignals(link, onSignals) {
    if (link.polling || link.writer === null || link.closed) {
        return;
    }
    link.polling = true;
    link.port.getSignals().then(
        function (signals) {
            link.polling = false;
            if (!link.closed) {
                onSignals(signals.clearToSend);
            }
        },
        function () {
            link.polling = false;
        },
    );
}

/**
 * Close the port. Writes already handed to the port are sent first, while
 * those waiting for a reopen are dropped, and `onClose` does not run for a
 * link closed this way.
 *
 * @param {Link} link
 * @param {function(string | null): void} onDone
 */
export function close(link, onDone) {
    if (link.closed && !link.busy) {
        onDone(null);
        return;
    }
    link.closed = true;
    link.closeDone.push(onDone);
    if (link.busy) {
        return;
    }
    link.busy = true;
    shutdown(link, function (err) {
        finishBusy(link, err);
    });
}

/**
 * Close and open the port again at its new speed. A close requested in the
 * meantime wins, and a further speed change starts another reopen.
 *
 * @param {Link} link
 */
function reopen(link) {
    link.busy = true;
    shutdown(link, function (err) {
        if (link.closed) {
            finishBusy(link, err);
            return;
        }
        if (err !== null) {
            link.busy = false;
            fail(link, err);
            return;
        }
        openPort(link, function (openErr) {
            if (link.closed && openErr !== null) {
                // Closed while an open failed: there is no port left to close.
                finishBusy(link, null);
                return;
            }
            if (link.closed) {
                shutdown(link, function (closeErr) {
                    finishBusy(link, closeErr);
                });
                return;
            }
            link.busy = false;
            if (openErr !== null) {
                fail(link, openErr);
                return;
            }
            if (link.rate !== link.openRate) {
                reopen(link);
            }
        });
    });
}

/**
 * Open the port at `rate`, take its streams, set the handshake lines, start
 * reading, and send what was written while it was closed.
 *
 * @param {Link} link
 * @param {function(string | null): void} onDone
 */
function openPort(link, onDone) {
    const rate = link.rate;
    link.port.open({
        baudRate: rate,
        dataBits: 8,
        stopBits: 2,
        parity: "none",
        flowControl: "none",
    }).then(
        function () {
            const readable = link.port.readable;
            const writable = link.port.writable;
            if (readable === null || writable === null) {
                const err = "The serial port opened without its streams.";
                link.port.close().then(
                    function () {
                        onDone(err);
                    },
                    function () {
                        onDone(err);
                    },
                );
                return;
            }
            link.openRate = rate;
            link.reader = readable.getReader();
            link.writer = writable.getWriter();
            sendSignals(link);
            readLoop(link, link.reader);
            const pending = link.pending;
            link.pending = [];
            for (const bytes of pending) {
                write(link, bytes);
            }
            onDone(null);
        },
        function (ex) {
            onDone(serialError("Could not open the serial port", ex));
        },
    );
}

/**
 * Deliver reads until the reader is replaced or the port goes. A framing,
 * parity, or overrun error ends only the current stream, and the port then
 * offers a new one; a lost device leaves none.
 *
 * Recursing through the read callback is the loop; each step resumes in a
 * later microtask.
 *
 * @param {Link} link
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 */
function readLoop(link, reader) {
    reader.read().then(
        function (res) {
            if (link.reader !== reader) {
                return;
            }
            if (res.done) {
                fail(link, "The serial port closed.");
                return;
            }
            link.onData(res.value);
            readLoop(link, reader);
        },
        function (ex) {
            if (link.reader !== reader) {
                return;
            }
            reader.releaseLock();
            const readable = link.port.readable;
            if (readable === null) {
                link.reader = null;
                fail(link, serialError("The serial port was lost", ex));
                return;
            }
            link.reader = readable.getReader();
            readLoop(link, link.reader);
        },
    );
}

/**
 * Close a link that failed and report why, once.
 *
 * @param {Link} link
 * @param {string} err
 */
function fail(link, err) {
    if (link.closed) {
        return;
    }
    link.closed = true;
    link.pending = [];
    if (link.busy) {
        link.onClose(err);
        return;
    }
    link.busy = true;
    shutdown(link, function () {
        finishBusy(link, null);
        link.onClose(err);
    });
}

/**
 * Stop reading, let queued writes drain, release both streams, and close the
 * port. Each step goes on when the one before fails, so an unplugged port
 * still ends up closed.
 *
 * @param {Link} link
 * @param {function(string | null): void} onDone
 */
function shutdown(link, onDone) {
    const reader = link.reader;
    const writer = link.writer;
    link.reader = null;
    link.writer = null;
    link.polling = false;
    if (reader === null) {
        closeWriter();
        return;
    }
    reader.cancel().then(releaseReader, releaseReader);

    function releaseReader() {
        if (reader !== null) {
            reader.releaseLock();
        }
        closeWriter();
    }

    function closeWriter() {
        if (writer === null) {
            closePort();
            return;
        }
        writer.close().then(releaseWriter, releaseWriter);
    }

    function releaseWriter() {
        if (writer !== null) {
            writer.releaseLock();
        }
        closePort();
    }

    function closePort() {
        link.port.close().then(
            function () {
                onDone(null);
            },
            function (ex) {
                onDone(serialError("Could not close the serial port", ex));
            },
        );
    }
}

/**
 * End a busy spell. A closed link has then let go of its port: its closes
 * complete, and the next link on the port opens.
 *
 * @param {Link} link
 * @param {string | null} err
 */
function finishBusy(link, err) {
    link.busy = false;
    if (!link.closed) {
        return;
    }
    const closeDone = link.closeDone;
    link.closeDone = [];
    for (const onDone of closeDone) {
        onDone(err);
    }
    if (portLinks.get(link.port) === link) {
        portLinks.delete(link.port);
    }
    const next = link.next;
    link.next = null;
    if (next !== null) {
        next();
    }
}

/**
 * Put the wanted level on RTS and DTR while the port is open; opening sets it
 * again.
 *
 * @param {Link} link
 */
function sendSignals(link) {
    if (link.writer === null || link.closed) {
        return;
    }
    link.port.setSignals({
        requestToSend: link.ready,
        dataTerminalReady: link.ready,
    }).then(function () {}, function () {});
}

/**
 * A Web Serial failure arrives as a rejection that is not guaranteed to carry
 * an Error with a message; Chrome's messages end in their own full stop.
 *
 * @param {string} lead
 * @param {*} ex
 * @returns {string}
 */
function serialError(lead, ex) {
    let err = lead;
    if (ex instanceof Error && ex.message !== "") {
        err += ": " + ex.message.replace(/\.$/, "");
    }
    return err + ".";
}

/**
 * @param {number} value
 * @returns {string}
 */
function hex4(value) {
    return value.toString(16).toUpperCase().padStart(4, "0");
}
