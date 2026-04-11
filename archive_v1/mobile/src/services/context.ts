import { queryAll, queryOne } from './db';

export const getContextSummary = async (): Promise<string> => {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // 1. Get Nutrition Totals for today
    const nutrition = await queryOne<{ total_cal: number }>(
      'SELECT SUM(calories) as total_cal FROM nutrition_logs WHERE date = ?',
      [today]
    );
    const calories = nutrition?.total_cal || 0;

    // 2. Get latest Sleep log
    const sleep = await queryOne<{ hours_slept: number }>(
      'SELECT hours_slept FROM sleep_logs ORDER BY timestamp DESC LIMIT 1'
    );
    const sleepHours = sleep?.hours_slept || 0;

    // 3. Get Active Goals
    const activeGoals = await queryAll<{ title: string, current_value: number, target_value: number }>(
      "SELECT title, current_value, target_value FROM goals WHERE status = 'active' LIMIT 3"
    );
    const goalsStr = activeGoals.length > 0 
      ? activeGoals.map(g => `"${g.title}" (${g.current_value}/${g.target_value})`).join(', ')
      : 'None';

    // 4. Get Weekly Spending
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    const finance = await queryOne<{ total_spent: number }>(
      'SELECT SUM(amount) as total_spent FROM finance_logs WHERE date >= ?',
      [weekAgoStr]
    );
    const weeklySpend = finance?.total_spent || 0;

    // Build the final summary string
    return `
[USER CONTEXT — today is ${today}]
Nutrition: ${calories} kcal today
Sleep: ${sleepHours.toFixed(1)}hrs latest
Active goals: ${goalsStr}
Spending this week: $${weeklySpend.toFixed(2)}
`.trim();

  } catch (error) {
    console.error('Error building context summary:', error);
    return `[USER CONTEXT — today is ${today}] (Data unavailable)`;
  }
};
