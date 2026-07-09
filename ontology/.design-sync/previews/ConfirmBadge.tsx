import { ConfirmBadge } from "ontology";

const row = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 8,
  width: 360,
};

export const DedupBadges = () => (
  <div style={row}>
    <ConfirmBadge verdict="reuse" confidence={0.94} />
    <ConfirmBadge verdict="relate" confidence={0.78} />
    <ConfirmBadge verdict="possible_duplicate" confidence={0.72} />
    <ConfirmBadge verdict="new" confidence={0.55} />
  </div>
);

export const StatusBadges = () => (
  <div style={row}>
    <ConfirmBadge verdict="extend" confidence={0.81} />
    <ConfirmBadge verdict="fork" confidence={0.66} />
    <ConfirmBadge verdict="pass" confidence={0.9} />
    <ConfirmBadge verdict="block" confidence={0.83} />
  </div>
);

export const NoConfidence = () => (
  <div style={row}>
    <ConfirmBadge verdict="reuse" />
    <ConfirmBadge verdict="block" />
  </div>
);
