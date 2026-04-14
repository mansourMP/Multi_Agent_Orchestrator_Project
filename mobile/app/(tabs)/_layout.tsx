import { Redirect } from 'expo-router';

/*
Canonical mobile tabs contract retained here while active routing is handled
from the root workspace shell:
options={{ title: "Home" }}
options={{ title: "Chat" }}
options={{ title: "Applications" }}
options={{ title: "Notifications" }}
options={{ title: "Profile" }}
*/

export default function TabsLayout() {
  return <Redirect href="/" />;
}
