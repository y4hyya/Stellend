export default function Opportunities() {
  const opportunities = [
    {
      type: "Loan",
      borrower: "Sarah Chen",
      amount: "$15,000",
      rate: "8.5%",
      term: "36 months",
      progress: 65,
      status: "65% funded",
    },
    {
      type: "Loan",
      borrower: "Marcus Johnson",
      amount: "$8,500",
      rate: "7.2%",
      term: "24 months",
      progress: 88,
      status: "88% funded",
    },
    {
      type: "Loan",
      borrower: "Elena Rodriguez",
      amount: "$22,000",
      rate: "9.1%",
      term: "48 months",
      progress: 42,
      status: "42% funded",
    },
    {
      type: "Loan",
      borrower: "David Kim",
      amount: "$5,200",
      rate: "6.8%",
      term: "12 months",
      progress: 100,
      status: "Fully funded",
    },
  ]

  return (
    <section id="opportunities" className="py-16 sm:py-24 bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">Live opportunities</h2>
          <p className="text-lg text-muted-foreground">Explore active loans and start earning returns today</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {opportunities.map((opp, idx) => (
            <div
              key={idx}
              className="p-6 bg-background rounded-xl border border-border hover:border-primary/50 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-primary uppercase tracking-wide">Loan Request</p>
                  <h3 className="text-lg font-bold text-foreground mt-1">{opp.borrower}</h3>
                </div>
                <span className="text-2xl font-bold text-primary">{opp.amount}</span>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4 py-4 border-y border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Interest Rate</p>
                  <p className="font-semibold text-foreground">{opp.rate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Term</p>
                  <p className="font-semibold text-foreground">{opp.term}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <p className="font-semibold text-accent">{opp.status}</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Funding Progress</span>
                  <span className="text-xs font-medium text-muted-foreground">{opp.progress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-accent rounded-full h-2" style={{ width: `${opp.progress}%` }} />
                </div>
              </div>

              <button className="w-full py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition">
                Fund this loan
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
