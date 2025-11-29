export default function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Create your profile",
      description: "Sign up and complete KYC verification in minutes",
    },
    {
      num: "02",
      title: "Browse opportunities",
      description: "Explore verified borrowers or list your loan request",
    },
    {
      num: "03",
      title: "Connect & fund",
      description: "Agree on terms and fund instantly through our platform",
    },
    {
      num: "04",
      title: "Earn returns",
      description: "Receive monthly repayments with competitive interest rates",
    },
  ]

  return (
    <section id="how" className="py-16 sm:py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">How it works</h2>
          <p className="text-lg text-muted-foreground">Get started in four simple steps</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8">
          {steps.map((step, idx) => (
            <div key={idx} className="relative">
              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-gradient-to-r from-primary/50 to-primary/10" />
              )}
              <div className="relative">
                <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center border-4 border-background">
                  <span className="text-2xl font-bold text-primary">{step.num}</span>
                </div>
                <h3 className="font-semibold text-foreground text-center mb-2 text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground text-center">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
