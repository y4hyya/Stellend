export default function Features() {
  const features = [
    {
      icon: "🎯",
      title: "Smart Matching",
      description: "AI-powered algorithm matches lenders with borrowers based on risk profile and financial goals.",
    },
    {
      icon: "🔒",
      title: "Secure & Transparent",
      description: "Blockchain-verified transactions and complete transparency on loan terms and repayment schedules.",
    },
    {
      icon: "📊",
      title: "Real-time Analytics",
      description:
        "Monitor your investments with detailed dashboards showing returns, default rates, and portfolio health.",
    },
    {
      icon: "⚡",
      title: "Instant Funding",
      description: "Get approved within 24 hours and access funds immediately for urgent financial needs.",
    },
  ]

  return (
    <section className="py-16 sm:py-24 bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">Why choose Peerpool?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the future of lending with cutting-edge technology and community-driven finance
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="p-6 bg-background rounded-xl border border-border hover:border-primary/50 transition"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="font-semibold text-foreground mb-2 text-lg">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
