export interface DesktopApi {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  };
}
