import { notFound } from 'next/navigation';

import '../official-mini-apps.css';

type OfficialMiniAppDefinition = {
  title: string;
  eyebrow: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
  items: Array<{ title: string; detail: string; meta: string }>;
};

const OFFICIAL_MINI_APPS: Record<string, OfficialMiniAppDefinition> = {
  flashcards: {
    title: 'Flashcards',
    eyebrow: 'Study',
    summary: 'Review trusted notes with compact cards and fast recall prompts.',
    stats: [
      { label: 'Decks', value: '3' },
      { label: 'Due', value: '12' },
      { label: 'Streak', value: '5d' },
    ],
    items: [
      { title: 'Product language', detail: 'Positioning, terms, and approved claims.', meta: '4 due' },
      { title: 'Customer objections', detail: 'Short answers for pricing, privacy, and setup.', meta: '5 due' },
      { title: 'Launch checklist', detail: 'The production steps every agent should remember.', meta: '3 due' },
    ],
  },
  'calorie-tracking': {
    title: 'Calorie Tracker',
    eyebrow: 'Health',
    summary: 'Log meals and scan the day without leaving the workspace shell.',
    stats: [
      { label: 'Today', value: '1,840' },
      { label: 'Protein', value: '112g' },
      { label: 'Meals', value: '4' },
    ],
    items: [
      { title: 'Breakfast', detail: 'Eggs, toast, Greek yogurt.', meta: '520 kcal' },
      { title: 'Lunch', detail: 'Chicken bowl with rice and greens.', meta: '710 kcal' },
      { title: 'Snack', detail: 'Protein shake and banana.', meta: '310 kcal' },
    ],
  },
};

export default async function OfficialMiniAppPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const app = OFFICIAL_MINI_APPS[appId];
  if (!app) {
    notFound();
  }

  return (
    <main className="official-mini-app">
      <header className="official-mini-app__header">
        <p className="official-mini-app__eyebrow">{app.eyebrow}</p>
        <h1>{app.title}</h1>
        <p>{app.summary}</p>
      </header>

      <section className="official-mini-app__stats" aria-label="Summary">
        {app.stats.map((stat) => (
          <article key={stat.label} className="official-mini-app__stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="official-mini-app__list" aria-label="Items">
        {app.items.map((item) => (
          <article key={item.title} className="official-mini-app__item">
            <div>
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
            </div>
            <span>{item.meta}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
