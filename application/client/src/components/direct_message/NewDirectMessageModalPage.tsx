import { FormEvent, useCallback, useId, useState } from "react";

import { Button } from "@web-speed-hackathon-2026/client/src/components/foundation/Button";
import { Input } from "@web-speed-hackathon-2026/client/src/components/foundation/Input";
import { FontAwesomeIcon } from "@web-speed-hackathon-2026/client/src/components/foundation/FontAwesomeIcon";
import { ModalErrorMessage } from "@web-speed-hackathon-2026/client/src/components/modal/ModalErrorMessage";
import { ModalSubmitButton } from "@web-speed-hackathon-2026/client/src/components/modal/ModalSubmitButton";
import { NewDirectMessageFormData } from "@web-speed-hackathon-2026/client/src/direct_message/types";

interface Props {
  id: string;
  onSubmit: (values: NewDirectMessageFormData) => Promise<void>;
}

export const NewDirectMessageModalPage = ({ id, onSubmit }: Props) => {
  const inputId = useId();
  const errorMessageId = useId();
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedUsername = username.trim().replace(/^@/, "");
  const invalid = normalizedUsername.length === 0;
  const showFieldError = touched && invalid;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (invalid || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await onSubmit({ username: normalizedUsername });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setSubmitting(false);
      }
    },
    [invalid, submitting, normalizedUsername, onSubmit],
  );

  return (
    <div className="grid gap-y-6">
      <h2 className="text-center text-2xl font-bold">新しくDMを始める</h2>

      <form className="flex flex-col gap-y-6" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-y-1">
          <label className="block text-sm" htmlFor={inputId}>
            ユーザー名
          </label>
          <Input
            id={inputId}
            placeholder="username"
            leftItem={<span className="text-cax-text-subtle leading-none">@</span>}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showFieldError || undefined}
            aria-describedby={showFieldError ? errorMessageId : undefined}
          />
          {showFieldError && (
            <span className="text-cax-danger text-xs" id={errorMessageId}>
              <span className="mr-1">
                <FontAwesomeIcon iconType="exclamation-circle" styleType="solid" />
              </span>
              ユーザー名を入力してください
            </span>
          )}
        </div>

        <div className="grid gap-y-2">
          <ModalSubmitButton disabled={submitting || invalid} loading={submitting}>
            DMを開始
          </ModalSubmitButton>
          <Button variant="secondary" command="close" commandfor={id}>
            キャンセル
          </Button>
        </div>

        <ModalErrorMessage>{error}</ModalErrorMessage>
      </form>
    </div>
  );
};
