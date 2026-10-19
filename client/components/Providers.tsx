"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000, // fresh for 5 min: no request at all
            gcTime: 33 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: true,

          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}