declare module 'm3u8-parser' {
  export class Parser {
    push(chunk: string): void;
    end(): void;
    manifest: {
      targetDuration: number;
      segments: Array<{
        uri: string;
        duration: number;
        key?: {
          method: string;
          uri: string;
          iv: string;
        };
      }>;
      contentProtection?: any;
    };
  }
}
