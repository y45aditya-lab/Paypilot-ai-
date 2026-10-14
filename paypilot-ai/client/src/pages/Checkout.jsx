function Checkout() {
  return (
    <main className="min-w-0 flex-1 p-5 sm:p-8">
      <header>
        <p className="text-sm text-violet-400">CHECKOUT</p>
        <h2 className="mt-2 text-3xl font-bold">Payment checkout</h2>
        <p className="mt-2 text-sm text-slate-400">
          Preview the customer checkout area.
        </p>
      </header>
      <section className="mt-8 rounded-2xl border border-violet-500/20 bg-slate-900 p-6">
        <p className="text-sm leading-6 text-slate-300">
          This is a UI scaffold. Payment processing is not connected, and no
          payment will be charged.
        </p>
      </section>
    </main>
  )
}

export default Checkout
