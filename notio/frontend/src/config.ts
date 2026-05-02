export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type RequiredConfigVariableName = "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function readConfig(): SupabaseConfig {
  return {
    supabaseAnonKey: readRequiredConfigValue("VITE_SUPABASE_ANON_KEY"),
    supabaseUrl: readRequiredConfigValue("VITE_SUPABASE_URL")
  };
}

function readRequiredConfigValue(variableName: RequiredConfigVariableName): string {
  const rawValue = import.meta.env[variableName];
  if (typeof rawValue !== "string") {
    throw missingConfig(variableName);
  }

  const trimmedValue = rawValue.trim();
  if (trimmedValue.length === 0) {
    throw missingConfig(variableName);
  }

  return trimmedValue;
}

function missingConfig(variableName: RequiredConfigVariableName): ConfigError {
  return new ConfigError(`Missing required environment variable: ${variableName}`);
}
