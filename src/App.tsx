
import './App.css'
import laptopChameleon from './assets/watchover-laptop.png'
import { watchoverSignupPath } from './lib/watchoverAccess'

// ==========================================
// WATCHOVER — DATA
// ==========================================

const benefits = [
  {
    icon: '/icons/communication.webp',
    title: 'Better communication',
    description: 'Keep every conversation and client interaction in one place.',
    tone: 'mint',
  },
  {
    icon: '/icons/workflow.webp',
    title: 'Smarter workflows',
    description: 'Work with your existing tools, without changing your habits.',
    tone: 'blue',
  },
  {
    icon: '/icons/ai.webp',
    title: 'AI-powered growth',
    description: 'Turn everyday information into useful insights and opportunities.',
    tone: 'purple',
  },
  {
    icon: '/icons/visibility.webp',
    title: 'Complete visibility',
    description: 'Manage clients, products and teams from one intelligent platform.',
    tone: 'lime',
  },
]

const audiences = [
  {
    name: 'Associations',
    image: '/watchover/audience/associations.webp',
  },
  {
    name: 'E-commerce',
    image: '/watchover/audience/ecommerce.webp',
  },
  {
    name: 'Call centers',
    image: '/watchover/audience/call-centers.webp',
  },
  {
    name: 'Small businesses',
    image: '/watchover/audience/small-businesses.webp',
  },
  {
    name: 'Sales teams',
    image: '/watchover/audience/sales-teams.webp',
  },
  {
    name: 'Service companies',
    image: '/watchover/audience/service-companies.webp',
  },
]

// NEW — Four interface styles
const styles = [
  {
    name: 'Classic',
    description: 'Simple, elegant and timeless.',
    image: '/watchover/styles/classic.webp',
  },
  {
    name: 'Formal',
    description: 'Professional and structured.',
    image: '/watchover/styles/formal.webp',
  },
  {
    name: 'Gaming',
    description: 'Dynamic and motivating.',
    image: '/watchover/styles/gaming.webp',
  },
  {
    name: 'Cartoon',
    description: 'Creative and playful.',
    image: '/watchover/styles/cartoon.webp',
  },
]

// ==========================================
// WATCHOVER — MAIN APPLICATION
// ==========================================

function App() {
  return (
    <div className="app" id="top">

      {/* NAVIGATION */}
      <header className="site-header">
        <a href="#top" className="logo">
          Watch<span>Over</span>
        </a>

        <nav aria-label="Main navigation">
          <a href="#benefits">Benefits</a>
          <a href="#product">Product</a>
          <a href="#audience">Who it's for</a>
          <a href="#styles">Styles</a>
        </nav>

        <a href={watchoverSignupPath} className="button button-primary">
          Start my CRM project
        </a>
      </header>

      <main>

        {/* ==================================
            HERO SECTION
        ================================== */}

        <section className="hero">
          <div className="hero-content">

            <span className="eyebrow">
              YOUR BUSINESS, REIMAGINED
            </span>

            <h1>
              Your business.
              <br />
              <span>Your way.</span>
            </h1>

            <p>
              Meet Watchover, the AI-powered business platform
              that adapts to the way you work.
              Your clients, your team, your tools —
              perfectly connected.
            </p>

            <div className="hero-actions">
              <a
                href={watchoverSignupPath}
                className="button button-primary"
              >
                Start my CRM project →
              </a>

              <a 
                href="#/olimline" 
                className="button button-outline"
              >
                 Try the demo →
              </a>
            </div>

            <div className="hero-note">
              One platform. Infinite possibilities.
            </div>
          </div>

          {/* DASHBOARD PREVIEW */}

          <div className="hero-visual">
            <div className="visual-glow"></div>

            <div className="dashboard-preview">
              <div className="preview-header">
                <span className="preview-dots">● ● ●</span>
                <strong>WatchOver</strong>
                <span>✦ AI</span>
              </div>

              <div className="preview-body">
                <div className="preview-sidebar">
                  <span>Overview</span>
                  <span>Clients</span>
                  <span>Products</span>
                  <span>Analytics</span>
                </div>

                <div className="preview-main">
                  <h3>Good morning! </h3>

                  <div className="preview-stats">
                    <div>
                      <strong>1,284</strong>
                      <small>Clients</small>
                    </div>

                    <div>
                      <strong>+24%</strong>
                      <small>Growth</small>
                    </div>
                  </div>

                  <div className="preview-chart">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>

            {/* FLOATING ELEMENTS */}

            <div className="floating-card floating-ai">
              ✨ AI insights
            </div>

            <div className="floating-card floating-growth">
              ↗ Smarter growth
            </div>

            <img
              src={laptopChameleon}
              className="mascot mascot-laptop"
              alt="Watchover chameleon working on a laptop"
            />
          </div>
        </section>

        {/* ==================================
            BENEFITS SECTION
        ================================== */}

        <section
          className="section benefits-section"
          id="benefits"
        >
          <div className="section-heading">
            <span className="benefits-eyebrow">
              WHY WATCHOVER ?
            </span>

            <h2>
              Everything works{' '}
              <span className="highlight-green">
                better together.
              </span>
            </h2>

            <p>
              Less switching between tools.
              More time for what matters.
            </p>
          </div>

          <div className="benefits-grid">
            {benefits.map((benefit) => (
              <article
                className={`benefit-card tone-${benefit.tone}`}
                key={benefit.title}
              >
                <div className="benefit-icon">
                  <img
                    src={benefit.icon}
                    alt=""
                    loading="lazy"
                  />
                </div>

                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ==================================
            PRODUCT SECTION
        ================================== */}

        <section
          className="section product-section"
          id="product"
        >
          <div className="product-text">

            <span className="product-badge">
              MEET WATCHOVER
            </span>

            <h2>
              We adapt to <span>you.</span>
            </h2>

            <p>
              Watchover brings your clients, products,
              employees and communications together
              in one AI-powered workspace.
            </p>

            <p>
              Keep using Excel, Google Sheets, Gmail,
              Outlook and your existing processes.
              Watchover connects the pieces instead
              of replacing them.
            </p>

            <div className="integration-logos">
              <div className="integration-logo">
                <img
                  src="/watchover/excel.webp"
                  alt=""
                  loading="lazy"
                />
                <span>Excel</span>
              </div>

              <div className="integration-logo">
                <img
                  src="/watchover/sheets.webp"
                  alt=""
                  loading="lazy"
                />
                <span>Google Sheets</span>
              </div>

              <div className="integration-logo">
                <img
                  src="/watchover/gmail.webp"
                  alt=""
                  loading="lazy"
                />
                <span>Gmail</span>
              </div>

              <div className="integration-logo">
                <img
                  src="/watchover/outlook.webp"
                  alt=""
                  loading="lazy"
                />
                <span>Outlook</span>
              </div>
            </div>
          </div>

          {/* PRODUCT ILLUSTRATION */}

          <div className="product-art">
            <div
              className="product-art-glow"
              aria-hidden="true"
            ></div>

            <img
              src="/watchover/watchover-flow.webp"
              className="product-flow-image"
              alt="Watchover connecting communication, client management and AI intelligence"
              loading="lazy"
            />
          </div>
        </section>

        {/* ==================================
            AUDIENCE SECTION
        ================================== */}

        <section
          className="section audience-showcase"
          id="audience"
          aria-labelledby="audience-title"
        >
          <div className="audience-showcase__content">

            <div className="audience-showcase__heading">
              <span className="audience-showcase__badge">
                BUILT FOR YOUR WORLD
              </span>

              <h2 id="audience-title">
                Made for{' '}
                <span>every kind of business.</span>
              </h2>
            </div>

            {/* SIX BUSINESS CARDS */}

            <ul className="audience-showcase__grid">
              {audiences.map((audience) => (
                <li
                  className="audience-showcase__card"
                  key={audience.name}
                >
                  <img
                    src={audience.image}
                    alt={audience.name}
                    loading="lazy"
                  />
                </li>
              ))}
            </ul>

            {/* CHAMELEON MASCOT */}

            <div className="audience-showcase__mascot-area">
              <img
                src="/watchover/audience/chameleon-business.webp"
                className="audience-showcase__mascot"
                alt="Watchover chameleon with a small business"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ==================================
            STYLES SECTION — NEW
        ================================== */}

        <section
          className="section styles-section style-showcase"
          id="styles"
          aria-labelledby="styles-title"
        >
          <div className="style-showcase__heading">

            <span className="style-showcase__badge">
              MAKE IT YOURS
            </span>

            <h2 id="styles-title">
              One platform. <span>Your style.</span>
            </h2>

            <p>
              Choose an interface that feels like your company.
            </p>
          </div>

          {/* FOUR DASHBOARD STYLES */}

          <div className="style-showcase__grid">
            {styles.map((style) => (
              <article
                className={`style-showcase__card style-showcase__card--${style.name.toLowerCase()}`}
                key={style.name}
              >
                <img
                  src={style.image}
                  alt={`${style.name} dashboard — ${style.description}`}
                  loading="lazy"
                />
              </article>
            ))}
          </div>
        </section>

        {/* ==================================
            FINAL CALL TO ACTION
        ================================== */}

        <section className="final-cta">
          <h2>
            Ready to work <span>your way?</span>
          </h2>

          <p>
            Discover a smarter way to run your business.
          </p>

          <a
            href={watchoverSignupPath}
            className="button button-light"
          >
            Start my CRM project →
          </a>
        </section>

      </main>

      {/* FOOTER */}

      <footer>
        <a href="#top" className="logo">
          Watch<span>Over</span>
        </a>

        <p>
          Your business. Your workflow.
          Smarter with AI.
        </p>

        <small>
          © {new Date().getFullYear()} Watchover
        </small>
      </footer>

    </div>
  )
}

export default App
