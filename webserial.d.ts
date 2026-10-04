interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: number | string;
}

interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: "none" | "even" | "odd";
    bufferSize?: number;
    flowControl?: "none" | "hardware";
}

interface SerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
}

interface SerialInputSignals {
    dataCarrierDetect: boolean;
    clearToSend: boolean;
    ringIndicator: boolean;
    dataSetReady: boolean;
}

interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
    getSignals(): Promise<SerialInputSignals>;
    setSignals(signals: SerialOutputSignals): Promise<void>;
}

interface Serial extends EventTarget {
    requestPort(): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
    readonly serial?: Serial;
}
