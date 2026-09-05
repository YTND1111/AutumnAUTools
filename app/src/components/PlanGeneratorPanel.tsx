import { useEffect, useState } from "react";
import type { PlanGenerator } from "../hooks/usePlanGenerator";
import { CAMPUS_PREF_TEXT } from "../services/planGenerator";

/**
 * PlanGeneratorPanel —— 方案生成面板（偏好设置 + 生成主操作 + 方案候选 pills）。
 *
 * 对齐原站 PoolToolbar（plan 模式）+ PlanCandidateArea：
 * - 「偏好设置」集中收纳（UI 重构：此前校区偏好与用户设置卡片重复、偏好按钮分散）：
 *   校区偏好采用分段按钮直接设定；时间段偏好为阻塞时段编辑开关（开启后点击
 *   课表格子/星期/节次标记不可用）；重置偏好为小组内轻量操作；
 * - 「生成方案」为全宽主操作大按钮（编辑模式下点击给出原站 toast 提示）；
 * - 候选区：无冲突方案 pills + 冲突方案 pills（红色），点击切换激活方案，
 *   网格随即显示对应方案（activePlanId 经 PlanProvider 持久化）；
 * - 校区偏好复用设置层 settings.campusPreference（不再单设状态）。
 */

const CAMPUS_VALUES = ["none", "east", "west"] as const;
type CampusPref = (typeof CAMPUS_VALUES)[number];

export default function PlanGeneratorPanel({
  generator,
  prefEditing,
  onTogglePrefEditing,
  onResetPreferences,
  campusPreference,
  onSetCampus,
}: {
  generator: PlanGenerator;
  prefEditing: boolean;
  onTogglePrefEditing: () => void;
  onResetPreferences: () => void;
  campusPreference: CampusPref;
  onSetCampus: (value: CampusPref) => void;
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
            : "候选池 + 偏好设置 → 自动生成多套方案"}
        </span>
      </h2>

      {/* 偏好设置：集中收纳校区/时间段/重置，避免偏好按钮分散、重复 */}
      <div className="plan-prefs">
        <span className="plan-prefs-caption">偏好设置</span>

        <div className="plan-pref-row">
          <span className="plan-pref-label">校区偏好</span>
          <div className="plan-seg" role="group" aria-label="校区偏好">
            {CAMPUS_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={`plan-seg-btn${campusPreference === value ? " is-active" : ""}`}
                aria-pressed={campusPreference === value}
                onClick={() => onSetCampus(value)}
              >
                {CAMPUS_PREF_TEXT[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="plan-pref-row">
          <span className="plan-pref-label">时间段偏好</span>
          <button
            type="button"
            className={`pool-btn${prefEditing ? " is-active" : ""}`}
            aria-pressed={prefEditing}
            onClick={onTogglePrefEditing}
          >
            {prefEditing ? "完成设置" : "设置阻塞时段"}
          </button>
          <button type="button" className="plan-pref-reset" onClick={onResetPreferences}>
            重置偏好
          </button>
        </div>

        <p className={`plan-pref-hint${prefEditing ? " is-editing" : ""}`}>
          {prefEditing
            ? "编辑中：点击课表中的格子、星期或节次即可设为不可用，点「完成设置」结束"
            : "可先设置时间段偏好排除不想上课的时间，方案生成时会自动避让"}
        </p>
      </div>

      {/* 主操作：生成方案（大而显眼） */}
      <button type="button" className="plan-run-btn" onClick={handleGenerate}>
        生成方案
      </button>

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
