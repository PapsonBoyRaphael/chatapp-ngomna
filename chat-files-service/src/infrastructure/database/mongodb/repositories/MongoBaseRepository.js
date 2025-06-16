/**
 * Repository de base MongoDB
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../../shared/utils/logger');
const { ValidationException } = require('../../../../shared/exceptions/ValidationException');
const { NotFoundException } = require('../../../../shared/exceptions/NotFoundException');

const logger = createLogger('MongoBaseRepository');

class MongoBaseRepository {
  constructor(model, entityClass) {
    this.model = model;
    this.entityClass = entityClass;
  }

  // Méthodes CRUD de base

  async create(data, session = null) {
    try {
      logger.debug('Création d\'entité:', { data });

      const options = session ? { session } : {};
      const document = new this.model(data);
      const savedDocument = await document.save(options);

      logger.info('Entité créée:', { id: savedDocument._id });
      return this.toEntity(savedDocument);

    } catch (error) {
      logger.error('Erreur lors de la création:', { error: error.message, data });
      throw this.handleError(error);
    }
  }

  async findById(id, options = {}) {
    try {
      logger.debug('Recherche par ID:', { id });

      if (!id) {
        return null;
      }

      let query = this.model.findById(id);

      // Appliquer les options
      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.select) {
        query = query.select(options.select);
      }

      const document = await query.exec();
      
      if (!document) {
        logger.debug('Entité non trouvée:', { id });
        return null;
      }

      logger.debug('Entité trouvée:', { id });
      return this.toEntity(document);

    } catch (error) {
      logger.error('Erreur lors de la recherche par ID:', { error: error.message, id });
      throw this.handleError(error);
    }
  }

  async findByIds(ids, options = {}) {
    try {
      logger.debug('Recherche par IDs:', { ids, count: ids.length });

      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }

      let query = this.model.find({ _id: { $in: ids } });

      // Appliquer les options
      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.select) {
        query = query.select(options.select);
      }

      if (options.sort) {
        query = query.sort(options.sort);
      }

      const documents = await query.exec();
      
      logger.debug('Entités trouvées:', { count: documents.length });
      return documents.map(doc => this.toEntity(doc));

    } catch (error) {
      logger.error('Erreur lors de la recherche par IDs:', { error: error.message, ids });
      throw this.handleError(error);
    }
  }

  async update(id, data, session = null) {
    try {
      logger.debug('Mise à jour d\'entité:', { id, data });

      const options = { 
        new: true, 
        runValidators: true,
        ...(session && { session })
      };

      const updatedDocument = await this.model.findByIdAndUpdate(
        id,
        { ...data, updatedAt: new Date() },
        options
      );

      if (!updatedDocument) {
        throw new NotFoundException('Entité non trouvée pour mise à jour');
      }

      logger.info('Entité mise à jour:', { id });
      return this.toEntity(updatedDocument);

    } catch (error) {
      logger.error('Erreur lors de la mise à jour:', { error: error.message, id, data });
      throw this.handleError(error);
    }
  }

  async delete(id, session = null) {
    try {
      logger.debug('Suppression d\'entité:', { id });

      const options = session ? { session } : {};
      const deletedDocument = await this.model.findByIdAndDelete(id, options);

      if (!deletedDocument) {
        throw new NotFoundException('Entité non trouvée pour suppression');
      }

      logger.info('Entité supprimée:', { id });
      return true;

    } catch (error) {
      logger.error('Erreur lors de la suppression:', { error: error.message, id });
      throw this.handleError(error);
    }
  }

  async exists(id) {
    try {
      logger.debug('Vérification d\'existence:', { id });

      const count = await this.model.countDocuments({ _id: id });
      const exists = count > 0;

      logger.debug('Résultat existence:', { id, exists });
      return exists;

    } catch (error) {
      logger.error('Erreur lors de la vérification d\'existence:', { error: error.message, id });
      throw this.handleError(error);
    }
  }

  // Méthodes de requête

  async findAll(options = {}) {
    try {
      logger.debug('Recherche de toutes les entités:', { options });

      let query = this.model.find(options.filters || {});

      // Appliquer les options
      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.select) {
        query = query.select(options.select);
      }

      if (options.sort) {
        query = query.sort(options.sort);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.skip) {
        query = query.skip(options.skip);
      }

      const documents = await query.exec();
      
      logger.debug('Entités trouvées:', { count: documents.length });
      return documents.map(doc => this.toEntity(doc));

    } catch (error) {
      logger.error('Erreur lors de la recherche de toutes les entités:', { error: error.message, options });
      throw this.handleError(error);
    }
  }

  async findPaginated(filters = {}, pagination = {}, sort = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      logger.debug('Recherche paginée:', { filters, pagination, sort });

      // Construire la requête de base
      const baseQuery = { ...filters };

      // Compter le total
      const total = await this.model.countDocuments(baseQuery);

      // Construire la requête paginée
      let query = this.model.find(baseQuery);

      if (Object.keys(sort).length > 0) {
        query = query.sort(sort);
      } else {
        query = query.sort({ createdAt: -1 }); // Tri par défaut
      }

      query = query.skip(skip).limit(limit);

      // Exécuter la requête
      const documents = await query.exec();
      const entities = documents.map(doc => this.toEntity(doc));

      // Calculer les métadonnées de pagination
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      const paginationInfo = {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      };

      logger.debug('Recherche paginée terminée:', { 
        count: entities.length, 
        total, 
        page, 
        totalPages 
      });

      return {
        data: entities,
        pagination: paginationInfo
      };

    } catch (error) {
      logger.error('Erreur lors de la recherche paginée:', { 
        error: error.message, 
        filters, 
        pagination 
      });
      throw this.handleError(error);
    }
  }

  async count(filters = {}) {
    try {
      logger.debug('Comptage d\'entités:', { filters });

      const count = await this.model.countDocuments(filters);
      
      logger.debug('Comptage terminé:', { count });
      return count;

    } catch (error) {
      logger.error('Erreur lors du comptage:', { error: error.message, filters });
      throw this.handleError(error);
    }
  }

  // Méthodes de transaction

  async beginTransaction() {
    try {
      const session = await this.model.db.startSession();
      session.startTransaction();
      
      logger.debug('Transaction démarrée');
      return session;

    } catch (error) {
      logger.error('Erreur lors du démarrage de transaction:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async commitTransaction(session) {
    try {
      await session.commitTransaction();
      session.endSession();
      
      logger.debug('Transaction commitée');

    } catch (error) {
      logger.error('Erreur lors du commit de transaction:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async rollbackTransaction(session) {
    try {
      await session.abortTransaction();
      session.endSession();
      
      logger.debug('Transaction annulée');

    } catch (error) {
      logger.error('Erreur lors de l\'annulation de transaction:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async executeInTransaction(callback) {
    const session = await this.beginTransaction();
    
    try {
      const result = await callback(session);
      await this.commitTransaction(session);
      
      logger.info('Transaction exécutée avec succès');
      return result;

    } catch (error) {
      await this.rollbackTransaction(session);
      logger.error('Transaction échouée et annulée:', { error: error.message });
      throw error;
    }
  }

  // Méthodes utilitaires

  toEntity(document) {
    if (!document) {
      return null;
    }

    // Convertir le document MongoDB en objet plain
    const data = document.toObject ? document.toObject() : document;
    
    // Mapper _id vers id
    if (data._id) {
      data.id = data._id.toString();
      delete data._id;
    }

    // Supprimer __v
    if (data.__v !== undefined) {
      delete data.__v;
    }

    // Créer l'entité si une classe est fournie
    if (this.entityClass) {
      return new this.entityClass(data);
    }

    return data;
  }

  toDocument(entity) {
    if (!entity) {
      return null;
    }

    const data = entity.toJSON ? entity.toJSON() : entity;
    
    // Mapper id vers _id si nécessaire
    if (data.id && !data._id) {
      data._id = data.id;
      delete data.id;
    }

    return data;
  }

  handleError(error) {
    // Erreurs de validation MongoDB
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return new ValidationException(`Erreur de validation: ${messages.join(', ')}`);
    }

    // Erreurs de contrainte unique
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return new ValidationException(`Valeur déjà existante pour ${field}`);
    }

    // Erreurs de cast (ID invalide)
    if (error.name === 'CastError') {
      return new ValidationException('ID invalide');
    }

    // Autres erreurs
    return error;
  }

  // Méthodes de recherche avancée

  async findOne(filters, options = {}) {
    try {
      logger.debug('Recherche d\'une entité:', { filters });

      let query = this.model.findOne(filters);

      if (options.populate) {
        query = query.populate(options.populate);
      }

      if (options.select) {
        query = query.select(options.select);
      }

      if (options.sort) {
        query = query.sort(options.sort);
      }

      const document = await query.exec();
      
      if (!document) {
        logger.debug('Aucune entité trouvée:', { filters });
        return null;
      }

      logger.debug('Entité trouvée:', { id: document._id });
      return this.toEntity(document);

    } catch (error) {
      logger.error('Erreur lors de la recherche d\'une entité:', { 
        error: error.message, 
        filters 
      });
      throw this.handleError(error);
    }
  }

  async updateMany(filters, update, session = null) {
    try {
      logger.debug('Mise à jour multiple:', { filters, update });

      const options = session ? { session } : {};
      const result = await this.model.updateMany(
        filters,
        { ...update, updatedAt: new Date() },
        options
      );

      logger.info('Mise à jour multiple terminée:', { 
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount 
      });

      return result;

    } catch (error) {
      logger.error('Erreur lors de la mise à jour multiple:', { 
        error: error.message, 
        filters, 
        update 
      });
      throw this.handleError(error);
    }
  }

  async deleteMany(filters, session = null) {
    try {
      logger.debug('Suppression multiple:', { filters });

      const options = session ? { session } : {};
      const result = await this.model.deleteMany(filters, options);

      logger.info('Suppression multiple terminée:', { 
        deletedCount: result.deletedCount 
      });

      return result;

    } catch (error) {
      logger.error('Erreur lors de la suppression multiple:', { 
        error: error.message, 
        filters 
      });
      throw this.handleError(error);
    }
  }
}

module.exports = MongoBaseRepository;
