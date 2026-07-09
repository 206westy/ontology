import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
} from "ontology";

export const Hint = () => (
  <div style={{ padding: "48px 24px" }}>
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="정보">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
          </Button>
        </TooltipTrigger>
        <TooltipContent>신뢰도 0.80 이상만 자동 확정됩니다</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);
