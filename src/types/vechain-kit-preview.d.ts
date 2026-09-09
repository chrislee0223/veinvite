import '@vechain/vechain-kit';

declare module '@vechain/vechain-kit' {
  export function useGetAvatar(domain: string | undefined): {
    data?: string | null;
  };
}
