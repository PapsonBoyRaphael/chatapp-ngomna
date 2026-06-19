#!/usr/bin/env node
/**
 * Script de seeding — Insertion des utilisateurs dans la table `personnel`
 * Base de données : auth-user-service (PostgreSQL via Sequelize)
 *
 * Usage :
 *   node scripts/seed-users.js
 *
 * Prérequis : fichier .env correctement configuré à la racine du service.
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

// ─── Connexion ────────────────────────────────────────────────────────────────

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT || 5432,
    logging: false,
  },
);

// ─── Données à insérer ────────────────────────────────────────────────────────

/**
 * Découpe un nom_complet en { nom, prenom }.
 * Convention : le premier mot (en MAJUSCULES) est le NOM de famille,
 * le reste constitue le prénom.
 */
function splitNomComplet(nomComplet) {
  const parts = nomComplet.trim().split(/\s+/);
  // Si le premier mot est entièrement en majuscules → c'est le nom de famille
  if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
    return { nom: parts[0], prenom: parts.slice(1).join(" ") };
  }
  // Sinon on place le dernier mot comme nom (heuristique de repli)
  return { nom: parts[parts.length - 1], prenom: parts.slice(0, -1).join(" ") };
}

const rawUsers = [
  // ── Agent principal ────────────────────────────────────────────────────────
  {
    matricule: "1120703Z",
    nom_complet: "BOKENGUE Jeannot Constant",
    ministere_code: "20",
    code_rang: "R000",
    grade_letter: "R",
    code_structure: "20070400100700000000",
    nom_structure: "Bureau des travaux de développement et de test",
  },
  // ── Contacts / supérieurs ──────────────────────────────────────────────────
  {
    matricule: "0741529G",
    nom_complet: "BILOUNGA MARC FRANCOIS ROMARIC",
    ministere_code: "20",
    code_rang: "C007",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "0736573O",
    nom_complet: "ELONG SERGE CHRISTIAN",
    ministere_code: "20",
    code_rang: "C006",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "0674761N",
    nom_complet: "ESSOUCK ELISEE GABRIEL",
    ministere_code: "20",
    code_rang: "C004",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "0756218X",
    nom_complet: "MOUSSA HOUSSEINI",
    ministere_code: "20",
    code_rang: "C005",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "0740292I",
    nom_complet: "OLO ARMEL SINCLAIR",
    ministere_code: "20",
    code_rang: "C007",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "1120744C",
    nom_complet: "TADJO Janvier",
    ministere_code: "20",
    code_rang: "C005",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
  {
    matricule: "0746041X",
    nom_complet: "TSOUNGUI OWONA FRANCIS",
    ministere_code: "20",
    code_rang: "C006",
    grade_letter: "C",
    code_structure: "20070400100000000000",
    nom_structure: "Service d'Exploitation",
  },
];

// Transformation vers les colonnes de la table `personnel`
const users = rawUsers.map((u) => {
  const { nom, prenom } = splitNomComplet(u.nom_complet);
  return {
    // agt_id : on utilise le matricule comme identifiant agent externe
    agt_id: u.matricule,
    matricule: u.matricule,
    nom: (nom || "").toUpperCase(),
    prenom: (prenom || "").toUpperCase(),
    ministere: u.ministere_code,
    // Champs non fournis dans la source → NULL
    sexe: null,
    mmnaissance: null,
    aanaissance: null,
    lieunaissance: null,
  };
});

// ─── Insertion ────────────────────────────────────────────────────────────────

async function seed() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connexion PostgreSQL établie\n");

    let inserted = 0;
    let updated = 0;

    for (const user of users) {
      // Vérifie si le matricule existe déjà
      const [existing] = await sequelize.query(
        "SELECT id FROM personnel WHERE matricule = :matricule",
        {
          replacements: { matricule: user.matricule },
          type: sequelize.QueryTypes.SELECT,
        },
      );

      if (existing) {
        await sequelize.query(
          `UPDATE personnel
           SET agt_id = :agt_id,
               nom = :nom,
               prenom = :prenom,
               sexe = :sexe,
               mmnaissance = :mmnaissance,
               aanaissance = :aanaissance,
               lieunaissance = :lieunaissance,
               ministere = :ministere
           WHERE matricule = :matricule`,
          {
            replacements: user,
            type: sequelize.QueryTypes.UPDATE,
          },
        );

        console.log(
          `♻️ [UPDATE] ${user.matricule} — ${user.prenom} ${user.nom}`,
        );
        updated++;
        continue;
      }

      await sequelize.query(
        `INSERT INTO personnel
           (agt_id, matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere)
         VALUES
           (:agt_id, :matricule, :nom, :prenom, :sexe, :mmnaissance, :aanaissance, :lieunaissance, :ministere)`,
        {
          replacements: user,
          type: sequelize.QueryTypes.INSERT,
        },
      );

      console.log(`✅ [INSERT] ${user.matricule} — ${user.prenom} ${user.nom}`);
      inserted++;
    }

    console.log(
      `\n📊 Résumé : ${inserted} inséré(s), ${updated} mis à jour sur ${users.length} au total.`,
    );
  } catch (error) {
    console.error("❌ Erreur lors du seeding :", error.message);
    if (error.original) console.error("   Détail DB :", error.original.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
