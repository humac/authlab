"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { Card } from "@/components/ui/Card";

interface JWTDecoderProps {
  token: string;
}

function base64UrlDecode(str: string): string {
  // Replace URL-safe chars and add padding
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return str;
  }
}

export function JWTDecoder({ token }: JWTDecoderProps) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return (
      <p className="text-gray-500 text-sm">
        Invalid JWT format (expected 3 parts, got {parts.length})
      </p>
    );
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: string;
  let payload: string;
  try {
    header = JSON.stringify(JSON.parse(base64UrlDecode(headerB64)), null, 2);
  } catch {
    header = base64UrlDecode(headerB64);
  }

  try {
    payload = JSON.stringify(JSON.parse(base64UrlDecode(payloadB64)), null, 2);
  } catch {
    payload = base64UrlDecode(payloadB64);
  }

  const sections = [
    { title: "Header", content: header, color: "text-red-400" },
    { title: "Payload", content: payload, color: "text-purple-400" },
    {
      title: "Signature",
      content: signatureB64,
      color: "text-blue-400",
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Card key={section.title} className="bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h4 className={`text-sm font-semibold ${section.color}`}>
              {section.title}
            </h4>
            <CopyButton text={section.content} />
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto text-sm font-mono leading-relaxed">
            {section.content}
          </pre>
        </Card>
      ))}
    </div>
  );
}
