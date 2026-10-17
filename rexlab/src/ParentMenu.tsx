import { Check } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export type MenuChoice<Value extends string> = {
  value: Value;
  name: string;
  // The language the name is written in, where it is not the page's.
  lang?: string;
  symbol?: ReactNode;
};

export type ParentMenuProps<Value extends string> = {
  label: string;
  // What the button shows: a small symbol, and at most a short code.
  button: ReactNode;
  choices: readonly MenuChoice<Value>[];
  chosen: Value;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChoose: (value: Value) => void;
};

// A small button that opens a menu of choices, one of them ticked. The
// page that holds it decides which menu is open, so only one ever is, and
// closes it on a tap outside.
export function ParentMenu<Value extends string>({ label, button, choices, chosen, open, onOpen, onClose, onChoose }: ParentMenuProps<Value>) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // An opened menu takes the focus on its ticked choice, so a keyboard
  // starts where the parent left it.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  const close = () => {
    onClose();
    buttonRef.current?.focus();
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key in to) {
      event.preventDefault();
      items.at((to[event.key] ?? 0) % items.length)?.focus();
    }
  };

  return (
    <div className="parent-menu">
      <button
        ref={buttonRef}
        type="button"
        className="parent-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={open ? onClose : onOpen}
      >
        {button}
      </button>
      {open && (
        <div ref={menuRef} id={id} role="menu" aria-label={label} className="parent-menu-list" onKeyDown={moveFocus}>
          {choices.map(({ value, name, lang, symbol }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === chosen}
              tabIndex={-1}
              className="parent-menu-choice"
              onClick={() => {
                onChoose(value);
                close();
              }}
            >
              {symbol}
              <span className="parent-menu-name" lang={lang}>
                {name}
              </span>
              {value === chosen && <Check className="parent-menu-tick" size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
