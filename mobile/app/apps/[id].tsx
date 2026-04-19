import { Redirect, useLocalSearchParams } from "expo-router";

export default function AppDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  if (!params.id) {
    return <Redirect href="/apps" />;
  }
  return <Redirect href={`/apps/${String(params.id)}/home`} />;
}
