import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  ToastViewport,
} from "ontology";

const staticViewport = {
  position: "static" as const,
  width: 400,
  padding: 0,
  margin: 0,
};

export const CommitToast = () => (
  <ToastProvider duration={Infinity}>
    <Toast open style={{ position: "static", width: 380 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <ToastTitle>커밋 완료</ToastTitle>
        <ToastDescription>변경 12건이 스테이징에 반영되었습니다.</ToastDescription>
      </div>
      <ToastAction altText="되돌리기">되돌리기</ToastAction>
      <ToastClose />
    </Toast>
    <ToastViewport style={staticViewport} />
  </ToastProvider>
);

export const ConflictToast = () => (
  <ToastProvider duration={Infinity}>
    <Toast open variant="destructive" style={{ position: "static", width: 380 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <ToastTitle>병합 충돌</ToastTitle>
        <ToastDescription>3개 노드에서 브랜치 충돌이 발생했습니다.</ToastDescription>
      </div>
      <ToastAction altText="충돌 검토">검토</ToastAction>
      <ToastClose />
    </Toast>
    <ToastViewport style={staticViewport} />
  </ToastProvider>
);
