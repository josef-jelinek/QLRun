// Output weights for the near, centre and far channel positions. The QL mixes
// the IPC beeper as a single analog path; QSound PSG channels can be spread as
// a listening convenience. Both sets total 1.5 per output channel, so left plus
// right is identical either way.
const monoPan = {near: 0.5, center: 0.5, far: 0.5};
const stereoPan = {near: 0.85, center: 0.5, far: 0.15};

// Queue depth, in frames of audio. Below the low mark the audio thread asks for
// more, and the producer answers with whole frames, so the queue runs between
// the mark and one frame above it. One frame is what a single display refresh
// covers and leaves no room for a late refresh, a collection pause or a slow
// message; two absorb that. Asking by level rather than by amount is what keeps
// the machine at the device's pace: a frame is only run once a frame has been
// played, however long the round trip took. Past the cap the oldest audio is
// dropped, which is audible, so the cap sits well clear of the mark.
const queueLowFrames = 2;
const queueCapFrames = 4;
const bufferPoolSize = 8;

/**
 * @typedef {{
 *   frameSampleCount: number,
 *   lowSamples: number,
 *   context: AudioContext,
 *   node: AudioWorkletNode,
 *   queuedSamples: number,
 *   queuedAt: number,
 *   sentSamples: number,
 *   pool: Float32Array[],
 *   stats: SoundStats,
 * }} Sfx
 */

/**
 * Audio the queue has lost since the page loaded, in milliseconds. `cut` is
 * what an overrun discarded, which means the producer ran ahead of the device;
 * `gap` is what an underrun filled with silence, which means it fell behind.
 * Both stay at zero while the producer keeps pace. Updated about once a
 * second in place, so read the fields rather than holding on to the record.
 *
 * @typedef {{
 *   cut: number,
 *   gap: number,
 * }} SoundStats
 */

/**
 * Frames per second is passed in rather than read from the emulator core, so
 * the audio host stays usable without it. `onNeed` runs the producer as soon
 * as the audio thread asks for data, without waiting for the next display
 * refresh. A browser audio lifecycle change restarts the queue; the producer
 * reads `context.state` to tell whether it is rendering.
 *
 * @param {number} framesPerSecond
 * @param {function(): void} onNeed
 * @param {function(string | null, Sfx | null): void} onDone
 */
export function init(framesPerSecond, onNeed, onDone) {
    let context = null;
    try {
        context = new AudioContext();
    } catch (ex) {
        console.error("AudioContext fail", ex);
        onDone("No AudioContext available.", null);
        return;
    }
    if (context.audioWorklet === undefined) {
        context.close().then(function () {}, function () {});
        onDone("No AudioWorklet available.", null);
        return;
    }

    context.audioWorklet.addModule("sound.worklet.js").then(
        function () {
            /** @type {Sfx} */
            const sfx = {
                frameSampleCount: 0,
                lowSamples: 0,
                context,
                node: new AudioWorkletNode(
                    context,
                    "qlrun-out",
                    {
                        numberOfInputs: 0,
                        numberOfOutputs: 1,
                        outputChannelCount: [2],
                    },
                ),
                queuedSamples: 0,
                queuedAt: performance.now(),
                sentSamples: 0,
                pool: [],
                stats: {cut: 0, gap: 0},
            };

            sfx.node.port.onmessage = function (e) {
                const data = e.data;
                if (data === null || data === undefined) {
                    return;
                }
                switch (data.type) {
                case "need":
                    if (typeof data.remain === "number") {
                        // Whatever was sent after the audio thread took this
                        // reading is on its way but not in it yet, and whatever
                        // played while the reading waited to be read is gone.
                        const waited = Math.max(context.currentTime - data.time, 0);
                        const queued = data.remain + sfx.sentSamples - data.received - waited * context.sampleRate;
                        sfx.queuedSamples = Math.max(queued, 0);
                        sfx.queuedAt = performance.now();
                        onNeed();
                    }
                    return;
                case "spent":
                    if (sfx.pool.length < bufferPoolSize) {
                        sfx.pool.push(data.samples);
                    }
                    return;
                case "stats":
                    sfx.stats.cut = data.cut * 1000 / context.sampleRate;
                    sfx.stats.gap = data.gap * 1000 / context.sampleRate;
                    return;
                }
            };

            sfx.node.connect(context.destination);
            setFrameRate(sfx, framesPerSecond);
            context.onstatechange = function () {
                reset(sfx);
            };
            onDone(null, sfx);
        },
        function (ex) {
            console.error("AudioWorklet module fail", ex);
            context.close().then(function () {}, function () {});
            onDone("Failed to load audio worklet.", null);
        },
    );
}

/**
 * Whether the queue has fallen below its low mark and wants another frame. The
 * audio thread reports its depth when it asks for more, and elapsed time covers
 * the rest: a turbo burst, or any long task, drains the queue with no chance to
 * say so, and a producer working from the stale figure would hold off refilling
 * exactly when refilling matters. The wall clock is read rather than
 * `context.currentTime`, which only moves between tasks and so reads as frozen
 * from inside the burst that is draining the queue. A suspended context is not
 * playing anything, so nothing drains.
 *
 * @param {Sfx} sfx
 * @returns {boolean}
 */
export function wantsFrame(sfx) {
    let played = 0;
    if (sfx.context.state === "running") {
        played = (performance.now() - sfx.queuedAt) * sfx.context.sampleRate / 1000;
    }
    return Math.max(sfx.queuedSamples - played, 0) < sfx.lowSamples;
}

/**
 * Match the audio frame length to the current ZX8301 field rate.
 *
 * @param {Sfx} sfx
 * @param {number} framesPerSecond
 */
export function setFrameRate(sfx, framesPerSecond) {
    const frameSampleCount = Math.round(sfx.context.sampleRate / framesPerSecond);
    if (frameSampleCount === sfx.frameSampleCount) {
        return;
    }
    sfx.frameSampleCount = frameSampleCount;
    sfx.lowSamples = frameSampleCount * queueLowFrames;
    sfx.node.port.postMessage({
        type: "queue-samples",
        low: sfx.lowSamples,
        cap: frameSampleCount * queueCapFrames,
    });
}

/**
 * Drop queued samples and restart queue accounting.
 *
 * @param {Sfx} sfx
 */
export function reset(sfx) {
    sfx.queuedSamples = 0;
    sfx.queuedAt = performance.now();
    sfx.node.port.postMessage({type: "reset"});
}

/**
 * Resume browser audio after a user gesture when necessary.
 *
 * @param {Sfx} sfx
 */
export function resume(sfx) {
    if (sfx.context.state === "suspended") {
        // The resync belongs to the state change this causes, which lands when
        // the context has actually started rather than a moment before.
        sfx.context.resume().then(function () {}, function () {});
    }
}

/**
 * Spread QSound PSG channels across the stereo image, or sum them the way the
 * single analog output on the machine does.
 *
 * @param {Sfx} sfx
 * @param {boolean} on
 */
export function setStereo(sfx, on) {
    let pan = monoPan;
    if (on) {
        pan = stereoPan;
    }
    sfx.node.port.postMessage({type: "pan", near: pan.near, center: pan.center, far: pan.far});
}

/**
 * Silence the output while the queue keeps draining at the audio clock, so
 * frame pacing stays unchanged.
 *
 * @param {Sfx} sfx
 * @param {boolean} on
 */
export function setMuted(sfx, on) {
    sfx.node.port.postMessage({type: "mute", on});
}

/**
 * Tell the audio thread the producer has stopped on purpose, so a queue that
 * runs dry meanwhile is not reported as a gap.
 *
 * @param {Sfx} sfx
 * @param {boolean} on
 */
export function setPaused(sfx, on) {
    sfx.node.port.postMessage({type: "pause", on});
}

/**
 * One frame of mixed planes, which `push` interleaves for the worklet,
 * exactly as the machine's `audio` record accumulates it. Aliased rather than copied so the
 * shape stays checked against its producer. This is a type-only import and
 * pulls in no code.
 *
 * @typedef {import("./machine.js").AudioChunk} AudioChunk
 */

/**
 * Interleave and transfer one emulator audio chunk to the worklet.
 *
 * @param {Sfx} sfx
 * @param {AudioChunk} chunk
 */
export function push(sfx, chunk) {
    // Send at most two frames, the size every buffer is made for.
    const maxN = sfx.frameSampleCount * 2;
    const n = Math.min(chunk.n, maxN);
    if (n <= 0) {
        return;
    }
    // Interleave once and transfer ownership to the audio thread. This avoids
    // four structured-clone copies and four more allocations in the worklet.
    // Buffers come back once played, so a steady stream allocates nothing. One
    // made at a higher frame rate, for shorter frames, is too small and goes.
    let samples = sfx.pool.pop();
    if (samples === undefined || samples.length < maxN * 4) {
        samples = new Float32Array(maxN * 4);
    }
    for (let i = 0; i < n; i += 1) {
        const at = i * 4;
        // Adding the mono FM signal equally to all PSG planes keeps it centred:
        // either pan layout gives their common component the same total weight.
        const fm = chunk.fm[i];
        samples[at] = chunk.beep[i];
        samples[at + 1] = chunk.a[i] + fm;
        samples[at + 2] = chunk.b[i] + fm;
        samples[at + 3] = chunk.c[i] + fm;
    }
    sfx.queuedSamples += n;
    sfx.sentSamples += n;
    sfx.node.port.postMessage({type: "data", samples, length: n}, [samples.buffer]);
}
