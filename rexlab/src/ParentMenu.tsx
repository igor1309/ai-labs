import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button.tsx";

export type MenuChoice<Value extends string> = {
  value: Value;
  name: string;
  // The language the name is written in, where it is not the page's.
  lang?: string;
  symbol?: ReactNode;
  // A footnote in small text under the name.
  note?: string;
};

// Calls `fire` after `ms` milliseconds, unless the returned stop is
// called first.
type StartTimer = (ms: number, fire: () => void) => () => void;

// How long a menu takes to animate out, in milliseconds: app.css's
// --motion-small, which reduced motion keeps for its fade.
export const MENU_EXIT = 160;

export type ParentMenuProps<Value extends string> = {
  label: string;
  // What the button shows: a small symbol or picture, and at most a short
  // code.
  button: ReactNode;
  choices: readonly MenuChoice<Value>[];
  chosen: Value;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChoose: (value: Value) => void;
  // Times the menu's way out, so it stays until it has animated away.
  startTimer: StartTimer;
};

// A small button that opens a menu of choices, one of them ticked. The
// page that holds it decides which menu is open, so only one ever is, and
// closes it on a tap outside.
export function ParentMenu<Value extends string>({ label, button, choices, chosen, open, onOpen, onClose, onChoose, startTimer }: ParentMenuProps<Value>) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // However the menu closes, it stays on screen while it animates out,
  // hidden from reading, and comes back at once if it is opened again
  // meanwhile. It still catches taps, which do nothing: the rest of a
  // double tap on a choice lands on the leaving menu, never on the page
  // beneath it (docs/tap-safety.md).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const leaving = shown && !open;
  useEffect(() => {
    if (!leaving) return;
    return startTimer(MENU_EXIT, () => setShown(false));
  }, [leaving, startTimer]);

  // Each change of the choice shows the button's new face animating in;
  // the face it opens with stands still.
  const [face, setFace] = useState({ chosen, changes: 0 });
  if (face.chosen !== chosen) setFace({ chosen, changes: face.changes + 1 });

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
      <Button
        ref={buttonRef}
        className="parent-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={open ? onClose : onOpen}
      >
        <span key={face.changes} className="parent-menu-face" data-changed={face.changes > 0 ? "" : undefined}>
          {button}
        </span>
      </Button>
      {shown && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          aria-hidden={leaving || undefined}
          className="parent-menu-list"
          data-leaving={leaving ? "" : undefined}
          data-notes={choices.some(({ note }) => note) ? "" : undefined}
          onKeyDown={moveFocus}
        >
          {choices.map(({ value, name, lang, symbol, note }) => (
            <Button
              key={value}
              role="menuitemradio"
              aria-checked={value === chosen}
              tabIndex={-1}
              className="parent-menu-choice"
              onClick={() => {
                if (leaving) return;
                onChoose(value);
                close();
              }}
            >
              {symbol}
              <span className="parent-menu-words">
                <span className="parent-menu-name" lang={lang}>
                  {name}
                </span>
                {note && <span className="parent-menu-note">{note}</span>}
              </span>
              {value === chosen && <Check className="parent-menu-tick" size={18} />}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
