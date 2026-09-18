import { SendHorizontal } from "lucide-react";

type ComposerProps = {
  question: string;
  disabled?: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
};

export function Composer({ question, disabled = false, onQuestionChange, onSubmit }: ComposerProps) {
  return (
    <div className="composer">
      <input
        value={question}
        disabled={disabled}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="继续追问企业流程问题..."
        onKeyDown={(event) => event.key === "Enter" && onSubmit()}
      />
      <button disabled={disabled} onClick={onSubmit}><SendHorizontal size={18} />发送</button>
    </div>
  );
}
