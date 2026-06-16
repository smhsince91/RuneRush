"use client";

import React from "react";
import "@coinbase/onchainkit/styles.css";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "wagmi/chains";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function Providers({ children }: { children: React.ReactNode }) {
  // React 19 + Next dev/hot reload safe
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <OnchainKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
        chain={base}
        miniKit={{ enabled: true }}
      >
        {children}
      </OnchainKitProvider>
    </QueryClientProvider>
  );
}
