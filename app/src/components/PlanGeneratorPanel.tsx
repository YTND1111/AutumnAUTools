import { useEffect, useState } from "react";
import type { PlanGenerator } from "../hooks/usePlanGenerator";
import { CAMPUS_PREF_TEXT } from "../services/planGenerator";

/**
 * PlanGeneratorPanel —— 方案生成面板（工具栏 + 方案候选 pills）。
 *
 * 对齐原站 PoolToolbar（plan 模式）+ PlanCandidateArea：
 * - 工具栏：校区偏好循环 / 时间段偏好编辑开关 / 重置偏好 / 生成方案；
 * - 编辑模式开启时点击「生成方案」给出提示（原站 toast 文案）；
 * - 候选区：无冲突方案 pills + 冲突方案 pills（红色），点击切换激活方案，
 *   网格随即显示对应方案（activePlanId 经 PlanProvider 持久化）；
 * - 校区偏好复用设置层 settings.campusPreference（不再单设状态）。
 */

export default function PlanGeneratorPanel({
  generator,
  prefEditing,
  onTogglePrefEditing,
  onResetPreferences,
  campusPreference,
  onCycleCampus,
}: {
  generator: PlanGenerator;
  prefEditing: boolean;
  onTogglePrefEditing: () => void;
  onResetPreferences: () => void;
  campusPreference: "none" | "east" | "west";
  onCycleCampus: () => void;
}) {
  const { plans, conflicts, activePlanId, hasGenerated, errorText, generate, setActivePlan } = generator;
  const [hint, setHint] = useState("");

  // 提示自动消散（模拟原站 toast）
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(""), 3000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const handleGenerate = () => {
    if (prefEditing) {
      setHint("请先保存时间段偏好后再生成方案");
      return;
    }
    generate();
  };

  return (
    <section className="surface-card beta-card">
      <h2 className="beta-card-title">
        方案生成
        <span className="beta-card-sub">
          {hasGenerated
            ? errorText
              ? "生成失败"
              : `${plans.length} 套无冲突 · ${conflicts.length} 套冲突`
            : "候选池 + 校区偏好/阻塞时段 → 多套方案"}
        </span>
      </h2>

      <div className="plan-toolbar">
        <button type="button" className="pool-btn" onClick={onCycleCampus}>
          校区偏好：{CAMPUS_PREF_TEXT[campusPreference]}
        </button>
        <button
          type="button"
          className={`pool-btn pool-btn-wide${prefEditing ? " is-active" : ""}`}
          aria-pressed={prefEditing}
          onClick={onTogglePrefEditing}
        >
          {prefEditing ? "保存" : "时间段偏好"}
        </button>
        <button type="button" className="pool-btn" onClick={onResetPreferences}>
          重置偏好
        </button>
        <button type="button" className="pool-btn plan-generate-btn" onClick={handleGenerate}>
          生成方案
        </button>
      </div>

      {hint && <p className="plan-hint">{hint}</p>}

      {/* 方案候选区 */}
      <div className="plan-candidates">
        {errorText ? (
          <p className="plan-empty is-error">{errorText}</p>
        ) : !hasGenerated ? (
          <p className="plan-empty">方案候选区：点击“生成方案”后显示可用排课方案</p>
        ) : (
          <>
            {plans.length > 0 && (
              <>
                <span className="plan-group-label">无冲突方案：</span>
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={`plan-pill${activePlanId === plan.id ? " is-active" : ""}`}
                    onClick={() => setActivePlan(plan.id)}
                  >
                    {plan.name}（{plan.courses.length}门）
                  </button>
                ))}
              </>
            )}
            {plans.length > 0 && conflicts.length > 0 && <span className="plan-divider">|</span>}
            {conflicts.length > 0 && (
              <>
                <span className="plan-group-label is-conflict">冲突方案：</span>
                {conflicts.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={`plan-pill is-conflict${activePlanId === plan.id ? " is-active" : ""}`}
                    onClick={() => setActivePlan(plan.id)}
                  >
                    {plan.name}（{plan.courses.length}门）
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
