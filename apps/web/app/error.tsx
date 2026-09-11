"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-kumo-subtle">
          The editor hit an unexpected error and couldn&apos;t render this view.
          Your files and jobs are untouched.
          {error.digest ? ` (ref ${error.digest})` : null}
        </p>
        <div>
          <Button onClick={() => retry()}>Try again</Button>
        </div>
      </CardContent>
    </Card>
  );
}
