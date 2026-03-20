declare module 'react-native-apple-healthkit' {
  export interface HealthInputOptions {
    startDate: string;
    endDate?: string;
    limit?: number;
    ascending?: boolean;
  }

  export interface HealthKit {
    initHealthKit(options: any, callback: (err: any, results: any) => void): void;
    getStepCount(options: HealthInputOptions, callback: (err: any, results: any) => void): void;
  }

  const AppleHealthKit: HealthKit;
  export default AppleHealthKit;
}
