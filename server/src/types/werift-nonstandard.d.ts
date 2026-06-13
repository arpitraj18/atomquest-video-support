// The werift package exposes its non-standard helpers under the "werift/nonstandard"
// subpath export. Our CommonJS module resolution does not pick up the subpath's bundled
// types, so we declare the slice of the MediaRecorder API we actually use here. The shape
// was confirmed against the installed package at build time.
declare module 'werift/nonstandard' {
  import type { MediaStreamTrack } from 'werift';

  export interface MediaRecorderOptions {
    path: string;
    numOfTracks?: number;
    tracks?: MediaStreamTrack[];
    disableLipSync?: boolean;
    disableNtp?: boolean;
    width?: number;
    height?: number;
  }

  export class MediaRecorder {
    constructor(options: MediaRecorderOptions);
    readonly ext: string;
    readonly onError: { subscribe: (cb: (err: Error) => void) => void };
    addTrack(track: MediaStreamTrack): Promise<void>;
    stop(): Promise<void>;
  }
}
