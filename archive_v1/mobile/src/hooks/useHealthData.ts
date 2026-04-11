import AppleHealthKit, { HealthInputOptions } from 'react-native-apple-healthkit';

export const fetchDailyStats = () => {
  return new Promise((resolve, reject) => {
    const options: HealthInputOptions = {
      startDate: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    };
    AppleHealthKit.getStepCount(options, (err: any, results: any) => {
      if (err) reject(err);
      resolve(results);
    });
  });
};
