import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type BaseProps = {
  label: string;
  hint?: string;
};

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement> & { textarea?: false };
type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { textarea: true };

type Props = InputProps | TextareaProps;

export function InputField(props: Props) {
  const { label, hint } = props;

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {props.textarea ? (
        <textarea className="input textarea" {...props} />
      ) : (
        <input className="input" {...props} />
      )}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
