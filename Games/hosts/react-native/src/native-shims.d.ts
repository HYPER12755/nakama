// Minimal ambient declarations so the host package can be typechecked without
// installing the native React Native toolchain on the development host. The
// consuming app supplies the real React Native modules.
declare module "react-native" {
  import type * as React from "react";

  export const View: React.ComponentType<any>;
  export const Text: React.ComponentType<any>;
  export const TextInput: React.ComponentType<any>;
  export const Pressable: React.ComponentType<any>;
  export const ScrollView: React.ComponentType<any>;
  export const SafeAreaView: React.ComponentType<any>;
  export const ActivityIndicator: React.ComponentType<any>;
  export const StyleSheet: {
    create<T extends Record<string, unknown>>(styles: T): T;
    flatten(style: unknown): Record<string, unknown>;
  };
  export function useColorScheme(): "light" | "dark" | null;
  export const BackHandler: {
    addEventListener(
      type: "hardwareBackPress",
      listener: () => boolean,
    ): { remove(): void };
  };
  export const Vibration: {
    vibrate(pattern?: number | number[]): void;
  };
  export const Linking: {
    openURL(url: string): Promise<void>;
  };
  export const Share: {
    share(content: {
      title?: string;
      message?: string;
      url?: string;
    }): Promise<{ action: string }>;
  };
  export const AppState: {
    currentState: string;
    addEventListener(
      type: "change",
      listener: (state: string) => void,
    ): { remove(): void };
  };
}

declare module "react-native-svg" {
  import type * as React from "react";

  const Svg: React.ComponentType<any>;
  export default Svg;
  export const Circle: React.ComponentType<any>;
  export const Path: React.ComponentType<any>;
  export const Rect: React.ComponentType<any>;
}

declare module "react-native-webview" {
  import type * as React from "react";

  export interface WebViewMessageEvent {
    nativeEvent: { data: string };
  }

  export class WebView extends React.Component<any> {
    injectJavaScript(script: string): void;
  }
}

declare module "react-native-fs" {
  export interface ReadDirItem {
    name: string;
    path: string;
    isDirectory(): boolean;
  }
  const RNFS: {
    DocumentDirectoryPath: string;
    CachesDirectoryPath: string;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    unlink(path: string): Promise<void>;
    readDir(path: string): Promise<ReadDirItem[]>;
    copyFile(from: string, to: string): Promise<void>;
    moveFile(from: string, to: string): Promise<void>;
    readFile(path: string, encoding: "base64" | "utf8"): Promise<string>;
    writeFile(
      path: string,
      contents: string,
      encoding?: "utf8" | "base64",
    ): Promise<void>;
    downloadFile(options: {
      fromUrl: string;
      toFile: string;
    }): { promise: Promise<{ statusCode: number }> };
  };
  export default RNFS;
}

declare module "react-native-zip-archive" {
  export function unzip(source: string, target: string): Promise<string>;
}
