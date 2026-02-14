import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata = {
  title: "FlashCardsPlus",
  description: "AI-assisted flashcards with spaced repetition"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
