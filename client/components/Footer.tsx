import Link from "next/link";
import Image from "next/image";

const sectionStyle = "flex flex-col gap-2 text-sm text-gray-400";
const linkStyle = "hover:text-white transition";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-neutral-950">
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className={sectionStyle}>
          <span className="text-white font-medium">Resources</span>
          <Link href="/docs" className={linkStyle}>Docs</Link>
          <Link href="/docs#faq" className={linkStyle}>FAQ</Link>
        </div>

<div className={sectionStyle}>
  <span className="text-white font-medium">Social</span>

  <a
    href="https://github.com/b-adamson/ARCIBID"
    target="_blank"
    rel="noopener noreferrer"
    className={linkStyle}
  >
    GitHub
  </a>

  <a
    href="https://t.me/+NGbdEEbM-AYyNDZk"
    target="_blank"
    rel="noopener noreferrer"
    className={linkStyle}
  >
    Telegram
  </a>
</div>

        <div className={sectionStyle}>
          <span className="text-white font-medium">Ecosystem</span>
          <a
            href="https://docs.arcium.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkStyle}
          >
            Arcium Docs
          </a>
          <a
            href="https://docs.solana.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkStyle}
          >
            Solana Docs
          </a>
        </div>

        <div className="flex flex-col justify-between">
          {/* Logo */}
          <Link href="/" className="block w-32 h-10 relative overflow-hidden">
            <Image
              src="/logo/GRADIENT_TRANSPARENT.png"
              alt="ARCRYPT logo"
              fill
              className="object-cover scale-110"
            />
          </Link>

          <span className="text-xs text-gray-500">
            © {new Date().getFullYear()} ARCRYPT
          </span>
        </div>
      </div>
    </footer>
  );
}