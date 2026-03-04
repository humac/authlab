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
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                index < currentStep
                  ? "bg-primary text-white"
                  : index === currentStep
                    ? "bg-primary text-white ring-4 ring-primary/20"
                    : "bg-gray-200 text-gray-600"
              }`}
            >
              {index < currentStep ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`mt-1 text-xs ${
                index <= currentStep
                  ? "text-primary font-medium"
                  : "text-gray-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-2 mt-[-1rem] ${
                index < currentStep ? "bg-primary" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
