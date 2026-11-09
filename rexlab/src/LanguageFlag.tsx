import type { Language } from "./language/language.ts";

// A language's flag in a circle: the Union flag for English, the Russian
// tricolour for Russian.
export function LanguageFlag({ language }: { language: Language }) {
  return (
    <svg className="language-flag-disc" data-language={language} viewBox="0 0 28 28" aria-hidden="true">
      <clipPath id={`flag-disc-${language}`}><circle cx="14" cy="14" r="14" /></clipPath>
      <g clipPath={`url(#flag-disc-${language})`}>
        {language === "en" ? (
          <svg x="-14" y="0" width="56" height="28" viewBox="0 0 60 30" preserveAspectRatio="none">
            <rect width="60" height="30" fill="var(--ds-flag-uk-blue)" />
            <path d="M0 0l60 30m0-30l-60 30" stroke="var(--ds-flag-white)" strokeWidth="6" />
            <path d="M0 0l60 30m0-30l-60 30" stroke="var(--ds-flag-uk-red)" strokeWidth="2" />
            <path d="M30 0v30m-30-15h60" stroke="var(--ds-flag-white)" strokeWidth="10" />
            <path d="M30 0v30m-30-15h60" stroke="var(--ds-flag-uk-red)" strokeWidth="6" />
          </svg>
        ) : (
          <>
            <rect width="28" height="9.34" fill="var(--ds-flag-white)" />
            <rect y="9.33" width="28" height="9.34" fill="var(--ds-flag-ru-blue)" />
            <rect y="18.67" width="28" height="9.34" fill="var(--ds-flag-ru-red)" />
          </>
        )}
      </g>
      <circle cx="14" cy="14" r="13.5" fill="none" stroke="var(--ds-flag-edge)" />
    </svg>
  );
}
