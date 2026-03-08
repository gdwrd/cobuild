import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export type GenerationStatus = 'generating' | 'success' | 'error' | 'retry-exhausted';
export type GenerationStage = 'spec' | 'architecture' | 'plan' | 'dev-plan';

export interface CompletedStage {
  label: string;
  filePath: string;
}

export interface GenerationScreenProps {
  status: GenerationStatus;
  filePath?: string;
  errorMessage?: string;
  currentStage?: GenerationStage;
  completedStages?: CompletedStage[];
  terminatedEarly?: boolean;
  devPlanProgress?: { current: number; total: number };
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Stepper internals
// ---------------------------------------------------------------------------

type StepStatus = 'done' | 'active' | 'pending' | 'skipped' | 'failed';

/** Ordered workflow stages — extend here to add an execution stage in future. */
const WORKFLOW_STAGES: GenerationStage[] = ['spec', 'architecture', 'plan', 'dev-plan'];

export const STAGE_DISPLAY_LABELS: Record<GenerationStage, string> = {
  spec: 'Project specification',
  architecture: 'Architecture document',
  plan: 'High-level development plan',
  'dev-plan': 'Per-phase dev plans',
};

/** Prefix used for per-phase dev plan completed-stage labels (e.g. "Dev plan — phase 1"). */
export const DEV_PLAN_PHASE_LABEL_PREFIX = 'Dev plan — phase';

/** Maps a completedStage label back to its workflow stage. */
function labelToStage(label: string): GenerationStage | undefined {
  if (label === STAGE_DISPLAY_LABELS.spec) return 'spec';
  if (label === STAGE_DISPLAY_LABELS.architecture) return 'architecture';
  if (label === STAGE_DISPLAY_LABELS.plan) return 'plan';
  if (label.startsWith(DEV_PLAN_PHASE_LABEL_PREFIX)) return 'dev-plan';
  return undefined;
}

function resolveStepStatus(
  stage: GenerationStage,
  status: GenerationStatus,
  currentStage: GenerationStage,
  completedStages: CompletedStage[],
  terminatedEarly: boolean,
): StepStatus {
  // Dev-plan is "active" while generating even when some phases are already recorded
  if (stage === 'dev-plan' && status === 'generating' && currentStage === 'dev-plan') {
    return 'active';
  }

  const isDone = completedStages.some((s) => labelToStage(s.label) === stage);
  if (isDone) return 'done';

  if (status === 'generating') {
    return stage === currentStage ? 'active' : 'pending';
  }

  if (status === 'success') {
    return terminatedEarly ? 'skipped' : 'pending';
  }

  if (status === 'error' || status === 'retry-exhausted') {
    if (stage === currentStage) return 'failed';
    // Only completedStages is authoritative — if not in there, show as pending
    return 'pending';
  }

  return 'pending';
}

// ---------------------------------------------------------------------------
// Step row components
// ---------------------------------------------------------------------------

function DoneStepRow({
  stage,
  completedStages,
}: {
  stage: GenerationStage;
  completedStages: CompletedStage[];
}) {
  const label = STAGE_DISPLAY_LABELS[stage];

  if (stage === 'dev-plan') {
    const phases = completedStages.filter((s) => labelToStage(s.label) === 'dev-plan');
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="green">{'✓ '}</Text>
          <Text>{label}</Text>
          <Text dimColor>
            {' — '}
            {phases.length} phase{phases.length === 1 ? '' : 's'}
          </Text>
        </Box>
        {phases.map((p, i) => (
          <Box key={i} paddingLeft={2}>
            <Text dimColor>{'↳ '}</Text>
            <Text color="cyan">{p.filePath}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  const entry = completedStages.find((s) => labelToStage(s.label) === stage);
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">{'✓ '}</Text>
        <Text>{label}</Text>
      </Box>
      {entry && (
        <Box paddingLeft={2}>
          <Text dimColor>{'↳ '}</Text>
          <Text color="cyan">{entry.filePath}</Text>
        </Box>
      )}
    </Box>
  );
}

function ActiveStepRow({
  stage,
  spinnerFrame,
  completedStages,
  devPlanProgress,
}: {
  stage: GenerationStage;
  spinnerFrame: number;
  completedStages: CompletedStage[];
  devPlanProgress?: { current: number; total: number };
}) {
  const label = STAGE_DISPLAY_LABELS[stage];
  const spinner = SPINNER_FRAMES[spinnerFrame];

  if (stage === 'dev-plan' && devPlanProgress) {
    const donePhases = completedStages.filter((s) => labelToStage(s.label) === 'dev-plan');
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="yellow">{spinner}</Text>
          <Text color="yellow">{' '}</Text>
          <Text color="yellow">{label}</Text>
          <Text color="yellow">
            {' — phase '}
            {devPlanProgress.current} of {devPlanProgress.total}
          </Text>
        </Box>
        {donePhases.map((p, i) => (
          <Box key={i} paddingLeft={2}>
            <Text dimColor>{'✓ phase '}</Text>
            <Text dimColor>{i + 1}</Text>
            <Text>{' '}</Text>
            <Text color="cyan">{p.filePath}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Text color="yellow">{spinner}</Text>
      <Text color="yellow">{' '}</Text>
      <Text color="yellow">{label}</Text>
    </Box>
  );
}

function FailedStepRow({
  stage,
  errorMessage,
}: {
  stage: GenerationStage;
  errorMessage?: string;
}) {
  const label = STAGE_DISPLAY_LABELS[stage];
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="red">{'✕ '}</Text>
        <Text color="red">{label}</Text>
      </Box>
      {errorMessage && (
        <Box paddingLeft={2}>
          <Text dimColor>{errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

function PendingStepRow({ stage }: { stage: GenerationStage }) {
  return (
    <Box>
      <Text dimColor>{'○ '}</Text>
      <Text dimColor>{STAGE_DISPLAY_LABELS[stage]}</Text>
    </Box>
  );
}

function SkippedStepRow({ stage }: { stage: GenerationStage }) {
  return (
    <Box>
      <Text dimColor>{'– '}</Text>
      <Text dimColor>{STAGE_DISPLAY_LABELS[stage]}</Text>
      <Text dimColor>{' (skipped)'}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GenerationScreen({
  status,
  filePath,
  errorMessage,
  currentStage = 'spec',
  completedStages = [],
  terminatedEarly = false,
  devPlanProgress,
  onRetry,
}: GenerationScreenProps) {
  const { exit } = useApp();
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Synthesize a completedStages entry when only the legacy filePath prop is provided
  const effectiveCompletedStages =
    completedStages.length === 0 && filePath
      ? [{ label: 'Project specification', filePath }]
      : completedStages;

  useEffect(() => {
    if (status !== 'generating') return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => exit(), 1500);
    return () => clearTimeout(timer);
  }, [status, exit]);

  useInput((char, key) => {
    // ctrl+c always exits cleanly regardless of status
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }
    if (status === 'retry-exhausted') {
      if (char === 'r' || char === 'R') {
        onRetry?.();
      } else {
        exit();
        process.exit(1);
      }
      return;
    }
    if (status === 'error') {
      exit();
      process.exit(1);
    }
  });

  const summaryLabel =
    status === 'success'
      ? terminatedEarly
        ? 'Artifacts generated.'
        : 'All artifacts generated.'
      : null;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Workflow stepper */}
      <Box flexDirection="column" gap={0}>
        {WORKFLOW_STAGES.map((stage) => {
          const stepStatus = resolveStepStatus(
            stage,
            status,
            currentStage,
            effectiveCompletedStages,
            terminatedEarly,
          );

          if (stepStatus === 'done') {
            return (
              <DoneStepRow
                key={stage}
                stage={stage}
                completedStages={effectiveCompletedStages}
              />
            );
          }
          if (stepStatus === 'active') {
            return (
              <ActiveStepRow
                key={stage}
                stage={stage}
                spinnerFrame={spinnerFrame}
                completedStages={effectiveCompletedStages}
                devPlanProgress={devPlanProgress}
              />
            );
          }
          if (stepStatus === 'failed') {
            // Error message shown only on the failed step row when status is error
            // For retry-exhausted, show below the stepper
            return (
              <FailedStepRow
                key={stage}
                stage={stage}
                errorMessage={status === 'error' ? errorMessage : undefined}
              />
            );
          }
          if (stepStatus === 'skipped') {
            return <SkippedStepRow key={stage} stage={stage} />;
          }
          return <PendingStepRow key={stage} stage={stage} />;
        })}
      </Box>

      {/* Status footer — shown below the stepper */}
      {status === 'success' && summaryLabel && (
        <Box marginTop={1}>
          <Text color="green">{summaryLabel}</Text>
        </Box>
      )}
      {status === 'retry-exhausted' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">{'Generation failed after all retry attempts.'}</Text>
          {errorMessage && <Text dimColor>{errorMessage}</Text>}
          <Text> </Text>
          <Text>
            {'Press '}
            <Text bold>R</Text>
            {' to retry, or any other key to exit.'}
          </Text>
        </Box>
      )}
      {status === 'error' && (
        <Box marginTop={1}>
          <Text dimColor>Press any key to exit.</Text>
        </Box>
      )}
    </Box>
  );
}
