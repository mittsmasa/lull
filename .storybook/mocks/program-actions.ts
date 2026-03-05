export type ProgramActionState = {
  error: string;
  fieldErrors?: Record<string, string>;
} | null;

export async function createProgram(
  _eventId: string,
  _prevState: ProgramActionState,
  _formData: FormData,
): Promise<ProgramActionState> {
  return null;
}

export async function updateProgram(
  _eventId: string,
  _programId: string,
  _prevState: ProgramActionState,
  _formData: FormData,
): Promise<ProgramActionState> {
  return null;
}

export async function deleteProgram(
  _eventId: string,
  _programId: string,
): Promise<{ error: string } | undefined> {
  return undefined;
}

export async function reorderPrograms(
  _eventId: string,
  _programIds: string[],
): Promise<{ error: string } | undefined> {
  return undefined;
}
