"use client";

interface Step {
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="mb-8 overflow-x-auto pb-2">
      <div className="mx-auto flex min-w-max items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-[var(--shadow-sm)]">
        {steps.map((step, index) => {
          const complete = index < currentStep;
          const active = index === currentStep;
          return (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    complete || active
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--muted)]"
                  } ${active ? "ring-4 ring-[var(--ring)]" : ""}`}
                >
                  {complete ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-[11px] font-medium uppercase tracking-[0.08em] ${
                    complete || active ? "text-[var(--text)]" : "text-[var(--muted)]"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 mb-6 h-0.5 w-10 rounded ${
                    complete ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
