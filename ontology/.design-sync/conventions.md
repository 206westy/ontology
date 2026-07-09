# Ontology Studio Design System — conventions

Built from the product's real **shadcn/ui** component set on **Tailwind CSS v4** with CSS-variable design tokens. Every component is imported from the shipped bundle (`window.OntologyDS.*`) and renders with the styles in `styles.css`. Product domain is a knowledge-graph editor (nodes, classes, relations, commits, branches).

## Wrapping & setup

Design tokens live in the `:root` block of `styles.css`, which is already in every design's CSS closure — **no ThemeProvider is needed** for the default (light) theme. A dark theme is available by putting `class="dark"` on an ancestor element. Most primitives are self-contained; the only context wrappers you must add:

- **Tooltip** — wrap the tree in `<TooltipProvider>` (once, high in the tree).
- **Form** — `Form` IS a react-hook-form `FormProvider`; spread a `useForm()` value into it: `<Form {...form}>…<FormField … /></Form>`.
- **Sidebar** — must render inside `<SidebarProvider>`.

Overlays (`Dialog`, `AlertDialog`, `Sheet`, `Popover`, `DropdownMenu`, `Select`, `ContextMenu`) are self-contained — compose `*Trigger` + `*Content`; they portal and position themselves.

## Styling idiom — Tailwind utilities + semantic tokens

Style with **Tailwind utility classes** (compiled into the shipped stylesheet) and **semantic tokens** — never raw hex. Prefer a component prop (e.g. `<Button variant="destructive">`) over restyling.

Semantic color families (each available as `bg-`, `text-`, `border-`): `primary` (+`-foreground`), `secondary`, `muted` (+`-foreground`), `accent`, `destructive`, `success`, `warning`, `info`, `card`, `popover`, `background`, `foreground`, `border`, `input`, `ring`.

- Radius: `rounded-sm` `rounded-md` `rounded-lg` `rounded-full`
- Type scale: `text-caption` `text-body-sm` `text-body` `text-heading-sm` `text-heading`
- Elevation: `shadow-elevation-1` / `shadow-elevation-2` (or standard Tailwind `shadow-sm` / `shadow-md`)
- Spacing: use standard Tailwind spacing utilities (`gap-2`, `p-4`, `space-y-1.5`), as the components do.

**The color design tokens are also CSS variables** in `:root`. For colors without a utility class — the ontology role colors (`--role-symptom` `--role-cause` `--role-check` `--role-action` `--role-part` `--role-admin`), surface hierarchy (`--surface-0`…`--surface-3`, `--surface-overlay`), and AI accents (`--ai-primary` `--ai-glow` `--ai-surface`) — reference them directly, e.g. `style={{ color: "hsl(var(--role-symptom))" }}` or `style={{ background: "hsl(var(--surface-1))" }}`.

## Where the truth lives

Before styling, read `styles.css` (it `@import`s the compiled `_ds_bundle.css` and the `:root` token block), and per component read `components/<group>/<Name>/<Name>.prompt.md` (usage + examples) and `<Name>.d.ts` (props).

## Build snippet

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge } = window.OntologyDS;

<Card className="w-[340px]">
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>엔진 과열</CardTitle>
      <Badge variant="secondary">증상</Badge>
    </div>
    <CardDescription>냉각계통 이상으로 엔진 온도가 임계치를 초과한 상태.</CardDescription>
  </CardHeader>
  <CardContent className="text-body text-muted-foreground">인스턴스 12건 · 신뢰도 0.92</CardContent>
  <CardFooter className="gap-2">
    <Button>확정</Button>
    <Button variant="outline">수정</Button>
  </CardFooter>
</Card>
```
