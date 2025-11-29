export default function CTA() {
  return (
    <section className="py-16 sm:py-24 bg-gradient-to-br from-primary to-secondary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4 text-balance">
          Join thousands of lenders earning returns
        </h2>
        <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
          Start your peer-to-peer lending journey today and grow your wealth through smart, transparent investing.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="px-8 py-3 bg-primary-foreground text-primary rounded-lg font-semibold hover:bg-primary-foreground/90 transition">
            Start investing now
          </button>
          <button className="px-8 py-3 border-2 border-primary-foreground text-primary-foreground rounded-lg font-semibold hover:bg-primary-foreground/10 transition">
            Learn more
          </button>
        </div>
      </div>
    </section>
  )
}
