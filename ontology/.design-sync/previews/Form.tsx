import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  Input,
  Button,
} from "ontology";

export const NodeForm = () => {
  const form = useForm({
    defaultValues: { name: "엔진 과열", nodeClass: "Symptom", confidence: "0.92" },
  });
  return (
    <Form {...form}>
      <form style={{ width: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>노드 이름</FormLabel>
              <FormControl>
                <Input placeholder="예: 엔진 과열" {...field} />
              </FormControl>
              <FormDescription>그래프에 표시될 인스턴스 이름입니다.</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nodeClass"
          render={({ field }) => (
            <FormItem>
              <FormLabel>클래스</FormLabel>
              <FormControl>
                <Input placeholder="예: Symptom" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">확정하여 커밋</Button>
      </form>
    </Form>
  );
};

export const InvalidField = () => {
  const form = useForm({ defaultValues: { relation: "" } });
  return (
    <Form {...form}>
      <form style={{ width: 360 }}>
        <FormField
          control={form.control}
          name="relation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>관계 유형</FormLabel>
              <FormControl>
                <Input aria-invalid placeholder="예: 원인이다" {...field} />
              </FormControl>
              <FormMessage>관계 유형은 필수 항목입니다.</FormMessage>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
