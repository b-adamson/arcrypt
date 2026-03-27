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
          <Link href="#" className={linkStyle}>FAQ</Link>
        </div>

        <div className={sectionStyle}>
          <span className="text-white font-medium">Social</span>
          <Link href="#" className={linkStyle}>GitHub</Link>
          <Link href="#" className={linkStyle}>X</Link>
          <Link href="#" className={linkStyle}>Discord</Link>
          <Link href="#" className={linkStyle}>Telegram</Link>
        </div>

        <div className={sectionStyle}>
          <span className="text-white font-medium">Ecosystem</span>
          <Link href="#" className={linkStyle}>Arcium Docs</Link>
          <Link href="#" className={linkStyle}>Solana Docs</Link>
        </div>

        <div className="flex flex-col justify-between">
          {/* Logo */}
          <Link href="/" className="block w-32 h-10 relative overflow-hidden">
            <Image
              src="/logo/GRADIENT_TRANSPARENT.png"
              alt="ARCIBID logo"
              fill
              className="object-cover scale-110"
            />
          </Link>

          <span className="text-xs text-gray-500">
            © {new Date().getFullYear()} ARCIBID
          </span>
        </div>
      </div>
    </footer>
  );
}