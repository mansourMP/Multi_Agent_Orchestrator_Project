import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatSurface } from './ChatSurface';

test('chat composer includes the microphone button', () => {
  const html = renderToStaticMarkup(
    <ChatSurface
      isMobile={false}
      sessions={[]}
      selectedSessionId={null}
      onSelectSession={() => undefined}
      onNewChat={() => undefined}
      goal=""
      setGoal={() => undefined}
      primaryGoalRef={createRef<HTMLTextAreaElement>()}
      onSend={() => undefined}
      chatBusy={false}
      messages={[]}
      providerBanner={null}
      permissionPrompt={null}
      targetLabel="Orion"
      targetHref="/agents"
      selectedModel="gpt-5.4"
      modelOptions={['gpt-5.4']}
      onSelectModel={() => undefined}
      trustLabel="Trusted"
      selectedDepth="standard"
      depthLabel="Standard"
      depthOptions={[{ value: 'standard', label: 'Standard' }]}
      onSelectDepth={() => undefined}
      identityDrawerOpen={false}
      onToggleIdentityDrawer={() => undefined}
      onCloseIdentityDrawer={() => undefined}
      identitySections={[]}
      identityActions={[]}
    />,
  );

  assert.match(html, /Start voice input/);
});
