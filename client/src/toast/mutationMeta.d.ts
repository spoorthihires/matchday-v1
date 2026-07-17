import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silentError?: boolean; successMessage?: string };
  }
}
