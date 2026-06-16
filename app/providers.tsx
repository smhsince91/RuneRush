
"use client";

import React, { useState } from "react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "wagmi/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 0, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ?? ""}
      chain={base}
      config={{
        appearance: {
          mode: "dark",
          theme: "default",
        },
        wallet: {
          display: "modal",
          preference: "all",
        },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </OnchainKitProvider>
  );
}
