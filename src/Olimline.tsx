import { useRef, useState } from 'react'
import { clientPortalPath } from './lib/clientPortal'
import { staffLoginPaths } from './lib/staffAccess'
import './Olimline.css'

const plans = [
  { id: 'essentiel', name: 'Essentiel', price: 39, data: 50, minutes: '500', international: 30, description: 'Tout simplement, rester en contact.' },
  { id: 'plus', name: 'Plus', price: 59, data: 150, minutes: '1 500', international: 120, description: 'Plus de liberté au quotidien.' },
  { id: 'monde', name: 'Monde', price: 89, data: 300, minutes: '3 000', international: 300, description: 'Pour ceux qui gardent le lien, partout.' },
]

export default function Olimline() {
  const [selectedPlan, setSelectedPlan] = useState(plans[1])
  const contactTitle = useRef<HTMLHeadingElement>(null)
  const message = `Bonjour Olimline,\n\nJe souhaite en savoir plus sur le forfait ${selectedPlan.name} à ${selectedPlan.price} ₪/mois.\n\nMon prénom :\nMon besoin :\nLe meilleur moment pour me contacter :\n\nMerci !`
  const emailLink = `mailto:naomiebocobza@naobocolab.com?subject=${encodeURIComponent(`[OLIMLINE] Demande de forfait ${selectedPlan.name}`)}&body=${encodeURIComponent(message)}`

  function choosePlan(plan: typeof plans[number]) {
    setSelectedPlan(plan)
    contactTitle.current?.scrollIntoView({ block: 'center' })
    contactTitle.current?.focus({ preventScroll: true })
  }

  return (
    <div className="ol-page" id="ol-top" lang="fr">
      <a className="ol-skip" href="#/olimline/forfaits">Aller aux forfaits</a>
      <div className="ol-demo-note">
        Olimline · Forfaits mobiles et accompagnement en français
        <a href="#top">Retour à Watchover ↗</a>
      </div>

      <header className="ol-header">
        <a className="ol-logo" href="#/olimline" aria-label="Olimline, accueil">olim<span>line.</span></a>
        <nav className="ol-nav" aria-label="Navigation Olimline">
          <a href="#/olimline/forfaits">Nos forfaits</a>
          <a href="#/olimline/parcours">Comment ça marche</a>
          <a href="#/olimline/questions">Vos questions</a>
        </nav>
        <a className="ol-button ol-button-small" href={clientPortalPath}>Espace client</a>
      </header>

      <main>
        <section className="ol-hero" aria-labelledby="ol-title">
          <div className="ol-hero-copy">
            <span className="ol-eyebrow">VOTRE LIGNE. VOTRE LIEN.</span>
            <h1 id="ol-title">Une nouvelle vie.<br />Les mêmes <span>liens.</span></h1>
            <p>Votre quotidien en Israël, vos proches en France. Trouvez le forfait qui vous ressemble, avec un accompagnement en français.</p>
            <div className="ol-actions">
              <a className="ol-button" href="#/olimline/forfaits">Trouver mon forfait <span aria-hidden="true">↗</span></a>
              <a className="ol-text-link" href="#/olimline/contact">J’ai une question →</a>
            </div>
            <p className="ol-hero-caption">Trois forfaits. Des besoins différents. Toujours le lien.</p>
          </div>

          <div className="ol-visual" aria-label="Illustration du forfait Plus : 150 Go, 1 500 minutes en Israël et 120 minutes vers la France">
            <div className="ol-orbit ol-orbit-one" aria-hidden="true" />
            <div className="ol-orbit ol-orbit-two" aria-hidden="true" />
            <div className="ol-destination ol-destination-fr">FRANCE <span>↗</span></div>
            <div className="ol-phone">
              <div className="ol-phone-bar"><span>olimline.</span><span aria-hidden="true">▮▮▮</span></div>
              <span className="ol-phone-caption">VOTRE FORFAIT</span>
              <h2>Un peu plus<br />de liberté.</h2>
              <div className="ol-data-circle"><strong>150</strong><span>Go inclus</span></div>
              <div className="ol-phone-row"><span>Appels en Israël</span><strong>1 500 min</strong></div>
              <div className="ol-phone-row"><span>Vers la France</span><strong>120 min</strong></div>
              <div className="ol-phone-price">Forfait Plus <strong>59 ₪ <small>/ mois</small></strong></div>
            </div>
            <div className="ol-destination ol-destination-il">ISRAËL <span>↗</span></div>
            <div className="ol-float-note"><span aria-hidden="true">✦</span> Proche, même de loin.</div>
          </div>
        </section>

        <section className="ol-plans ol-section" id="ol-forfaits" aria-labelledby="ol-plans-title">
          <div className="ol-section-intro"><span className="ol-eyebrow">À CHACUN SA CONNEXION</span><h2 id="ol-plans-title">Le bon forfait.<br /><span>Pour votre vraie vie.</span></h2><p>Internet, appels et minutes vers la France : comparez en un coup d’œil.</p></div>
          <div className="ol-plans-grid">
            {plans.map((plan) => (
              <article className={`ol-plan${plan.id === 'plus' ? ' ol-plan-featured' : ''}`} key={plan.id}>
                <span className="ol-plan-label">{plan.id === 'plus' ? 'LE JUSTE ÉQUILIBRE' : plan.id === 'monde' ? 'LE LIEN SANS COMPTER' : 'L’ESSENTIEL, BIEN FAIT'}</span>
                <h3>{plan.name}</h3><p className="ol-plan-description">{plan.description}</p>
                <p className="ol-plan-price"><strong>{plan.price}</strong><span>₪ / mois</span></p>
                <ul><li><strong>{plan.data} Go</strong> d’internet en Israël</li><li><strong>{plan.minutes} min</strong> d’appels en Israël</li><li><strong>{plan.international} min</strong> vers la France</li></ul>
                <button className={`ol-button${plan.id === 'plus' ? '' : ' ol-button-outline'}`} onClick={() => choosePlan(plan)}>Demander le forfait {plan.name} →</button>
              </article>
            ))}
          </div>
          <p className="ol-plan-footnote">Les minutes internationales couvrent les appels depuis Israël vers les fixes et mobiles en France. Pour les appels en voyage, renseignez-vous sur les conditions d’itinérance auprès de l’équipe.</p>
        </section>

        <section className="ol-steps ol-section" id="ol-parcours" aria-labelledby="ol-steps-title">
          <div><span className="ol-eyebrow">ON GARDE ÇA SIMPLE</span><h2 id="ol-steps-title">Une ligne.<br />Un vrai <span>interlocuteur.</span></h2></div>
          <ol><li><span>01</span><div><h3>Vous comparez.</h3><p>Repérez le forfait adapté à vos usages et à votre budget.</p></div></li><li><span>02</span><div><h3>On en parle.</h3><p>Indiquez vos besoins et vos questions à votre conseiller.</p></div></li><li><span>03</span><div><h3>Vous choisissez.</h3><p>Précisez votre demande avec un accompagnement en français.</p></div></li></ol>
        </section>

        <section className="ol-contact ol-section" id="ol-contact" aria-labelledby="ol-contact-title">
          <div><span className="ol-eyebrow">UNE QUESTION ? UN BESOIN ?</span><h2 id="ol-contact-title" ref={contactTitle} tabIndex={-1}>Parlons de<br /><span>votre forfait.</span></h2><p>Une grosse consommation de données ? Des appels réguliers en France ? Racontez-nous ce qui compte pour vous.</p></div>
          <div className="ol-contact-card"><span className="ol-plan-label">VOTRE CHOIX</span><h3>Olimline {selectedPlan.name}</h3><p>{selectedPlan.data} Go · {selectedPlan.international} min vers la France</p><strong className="ol-contact-price">{selectedPlan.price} ₪ / mois</strong><a className="ol-button" href={emailLink}>Préparer ma demande par email ↗</a><p className="ol-contact-hint">Votre messagerie s’ouvrira avec un message prérempli. Vous pourrez le compléter et l’envoyer.</p></div>
        </section>

        <section className="ol-faq ol-section" id="ol-questions" aria-labelledby="ol-faq-title">
          <span className="ol-eyebrow">TOUT SIMPLEMENT</span><h2 id="ol-faq-title">Les bonnes <span>questions.</span></h2>
          <details><summary>Que se passe-t-il après ma demande ?</summary><p>Votre message transmet vos besoins à l’équipe Olimline. Le catalogue est indicatif. Vous pouvez préciser les conditions et les prochaines étapes avec votre conseiller.</p></details>
          <details><summary>Comment préparer mes appels depuis l’étranger ?</summary><p>Les minutes vers la France s’utilisent depuis Israël. Si vous voyagez dans un autre pays, renseignez-vous auprès de l’équipe sur les conditions d’itinérance.</p></details>
          <details><summary>Comment transmettre ma demande ?</summary><p>Choisissez un forfait puis préparez votre demande par email. Le message s’ouvre dans votre messagerie et vous gardez la main sur son envoi.</p></details>
        </section>
      </main>

      <footer className="ol-footer">
        <a className="ol-logo" href="#/olimline">olim<span>line.</span></a>
        <p>Les liens qui comptent.</p>
        <a href="#top">Propulsé par Watchover ↗</a>
        <small>© {new Date().getFullYear()} Olimline</small>
        <div className="ol-footer-access">
          <a className="ol-button ol-button-outline ol-button-small" href={staffLoginPaths.coordinator}>
            Espace coordinateur
          </a>
        </div>
      </footer>
    </div>
  )
}
