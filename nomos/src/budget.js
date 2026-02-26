/**
 * Budget module — cost control & budget enforcement.
 *
 * Owned by chat-completions handler (the client that uses budget checks).
 *
 * Provides:
 *   logUsage(db, { projectId, model, promptTokens, completionTokens })
 *   checkBudget(db, projectId, now?)  → { allowed, remaining, limit, usage }
 *   getUsageReport(db, projectId)     → { projectId, budget, usage }
 */

export function createBudgetService(db) {
  const insertUsage = db.prepare(
    "INSERT INTO usage_log (project_id, model, prompt_tokens, completion_tokens, timestamp) VALUES (?, ?, ?, ?, ?)"
  );

  const incrementBudget = db.prepare(
    "UPDATE budgets SET current_usage = current_usage + ? WHERE project_id = ?"
  );

  const getBudget = db.prepare(
    "SELECT * FROM budgets WHERE project_id = ?"
  );

  const resetBudget = db.prepare(
    "UPDATE budgets SET current_usage = 0, period_start = ? WHERE project_id = ?"
  );

  const getUsageByProject = db.prepare(
    "SELECT model, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens, COUNT(*) as request_count FROM usage_log WHERE project_id = ? GROUP BY model"
  );

  const getTotalUsageByProject = db.prepare(
    "SELECT SUM(prompt_tokens + completion_tokens) as total_tokens FROM usage_log WHERE project_id = ?"
  );

  function logUsage({ projectId, model, promptTokens, completionTokens }, now) {
    const timestamp = (now || new Date()).toISOString().replace("T", " ").slice(0, 19);
    insertUsage.run(projectId, model, promptTokens, completionTokens, timestamp);
    const totalTokens = promptTokens + completionTokens;
    incrementBudget.run(totalTokens, projectId);
  }

  function periodExpired(budget, now) {
    const start = new Date(budget.period_start);
    if (budget.period === "daily") {
      const nextReset = new Date(start);
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      return now >= nextReset;
    }
    if (budget.period === "monthly") {
      const nextReset = new Date(start);
      nextReset.setUTCMonth(nextReset.getUTCMonth() + 1);
      return now >= nextReset;
    }
    return false;
  }

  function checkBudget(projectId, now) {
    const budget = getBudget.get(projectId);
    if (!budget) {
      return { allowed: true, remaining: null, limit: null, usage: 0 };
    }

    const currentTime = now || new Date();

    if (periodExpired(budget, currentTime)) {
      const newStart = currentTime.toISOString().slice(0, 10);
      resetBudget.run(newStart, projectId);
      return {
        allowed: true,
        remaining: budget.limit_tokens,
        limit: budget.limit_tokens,
        usage: 0,
      };
    }

    const remaining = budget.limit_tokens - budget.current_usage;
    return {
      allowed: remaining > 0,
      remaining,
      limit: budget.limit_tokens,
      usage: budget.current_usage,
    };
  }

  function getUsageReport(projectId) {
    const budget = getBudget.get(projectId);
    const breakdown = getUsageByProject.all(projectId);
    const totalRow = getTotalUsageByProject.get(projectId);
    const totalTokens = totalRow?.total_tokens || 0;

    return {
      project_id: projectId,
      total_tokens: totalTokens,
      budget: budget
        ? {
            limit_tokens: budget.limit_tokens,
            current_usage: budget.current_usage,
            remaining: budget.limit_tokens - budget.current_usage,
            period: budget.period,
            period_start: budget.period_start,
          }
        : null,
      by_model: breakdown.map((row) => ({
        model: row.model,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        total_tokens: row.prompt_tokens + row.completion_tokens,
        request_count: row.request_count,
      })),
    };
  }

  return { logUsage, checkBudget, getUsageReport };
}
