/*
 *  This file is part of the OpenLink RDF Editor
 *
 *  Copyright (C) 2014-2016 OpenLink Software
 *
 *  This project is free software; you can redistribute it and/or modify it
 *  under the terms of the GNU General Public License as published by the
 *  Free Software Foundation; only version 2 of the License, dated June 1991.
 *
 *  This program is distributed in the hope that it will be useful, but
 *  WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License along
 *  with this program; if not, write to the Free Software Foundation, Inc.,
 *  51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
 *
 */

(function($) {
  if (!window.RDFE) {
    window.RDFE = {};
  }

  RDFE.PredicateEditor = (function() {
    // constructor
    var c = function(doc, ontologyManager, predicate) {
      this.doc = doc;
      this.namingSchema = doc.config.options[doc.config.options["namingSchema"]];
      this.ontologyManager = ontologyManager;
      this.predicate = predicate;
    };

    var nodeFormatter = function(value) {
      if (value.interfaceName == "Literal") {
        if (value.datatype == 'http://www.w3.org/2001/XMLSchema#dateTime')
          return (new Date(value.nominalValue)).toString();
        else
          return value.nominalValue;
      } else {
        return value.toString();
      }
    };

    c.prototype.template = _.template(' \
      <div class="panel panel-default"> \
        <div class="panel-heading clearfix"> \
          <form class="form-inline"> \
            <div class="form-group" style="width: 80%;"> \
              <label><%= RDFE.Utils.namingSchemaLabel("p", this.namingSchema) %> </label> \
              <select name="predicate" class="form-control" style="width: 85%;"></select> \
            </div> \
            <div class="btn-group pull-right" role="group"> \
              <button type="button" class="btn btn-default btn-sm" id="backButton">Back</button> \
            </div> \
          </form> \
        </div> \
        <div class="panel-body" id="predicateTable"> \
        </div> \
        <div class="panel-body" id="predicateForm" style="display: none;"> \
      </div>'
    );

    c.prototype.render = function(editor, container, newStatement, backCallback) {
      var self = this;

      var predicateEditorData = function(container, backCallback) {
        $list.bootstrapTable({
          "striped": true,
          "sortName": 'subject',
          "pagination": true,
          "search": true,
          "searchAlign": 'left',
          "showHeader": true,
          "editable": true,
          "data": [],
          "dataSetter": predicateEditorDataSetter,
          "columns": [{
            "field": 'subject',
            "title": RDFE.Utils.namingSchemaLabel('s', self.namingSchema),
            "aligh": 'left',
            "sortable": true,
            "editable": function(triple) {
              return {
                "mode": "inline",
                "type": "rdfnode",
                "rdfnode": {
                  "config": self.doc.config.options,
                  "type": 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Resource'
                },
                "value": triple.subject
              }
            },
            formatter: nodeFormatter
          }, {
            "field": 'object',
            "title": RDFE.Utils.namingSchemaLabel('o', self.namingSchema),
            "align": 'left',
            "sortable": true,
            "editable": function(triple) {
              return {
                "mode": "inline",
                "type": "rdfnode",
                "rdfnode": {
                  "config": self.doc.config.options,
                  "predicate": self.predicate.uri,
                  "document": self.doc,
                  "ontologyManager": self.ontologyManager
                },
                "value": triple.object
              };
            },
            formatter: nodeFormatter
          }, {
            "field": 'actions',
            "title": '<button class="add btn btn-default" title="Add Relation" style="display: none;"><span class="glyphicon glyphicon-plus" aria-hidden="true"></span> New</button>',
            "align": 'center',
            "valign": 'middle',
            "class": 'small-column',
            "clickToSelect": false,
            "editable": false,
            "formatter": function(value, row, index) {
              return [
                '<a class="remove ml10" href="javascript:void(0)" title="Remove">',
                '<i class="glyphicon glyphicon-remove"></i>',
                '</a>'
              ].join('');
            },
            "events": {
              'click .remove': function (e, value, row, index) {
                self.doc.deleteTriple(row, function() {
                  $list.bootstrapTable('remove', {
                    field: 'id',
                    values: [row.id]
                  });
                }, function() {
                  $(self).trigger('rdf-editor-error', { "type": 'triple-delete-failed', "message": 'Failed to delete triple.' });
                });
              }
            }
          }]
        });

        self.predicateView = editor.predicateView;
        self.predicateTable = $list;
        self.predicateTableContainer = container.find('#predicateTable');
        self.predicateFormContainer = container.find('#predicateForm');
        self.addButton = $($list).find('.add');
        self.addButton.click(function() {
          self.createNewRelationEditor();
        });

        // reftersh predicates data
        self.renderData();
        if (newStatement) {
          self.createNewRelationEditor();
        }
      };

      var predicateEditorDataSetter = function(triple, field, newValue) {
        var newNode = newValue;

        if (field === 'predicate') {
          newNode = self.doc.store.rdf.createNamedNode(newValue);
        }
        if (newValue.toStoreNode) {
          newNode = newValue.toStoreNode(self.doc.store);
        }
        else if (field != 'object' ||
          triple.object.interfaceName == 'NamedNode') {
          newNode = self.doc.store.rdf.createNamedNode(newValue);
        }
        else if (triple.object.datatype == 'http://www.w3.org/2001/XMLSchema#dateTime') {
          var d = new Date(newValue);
          newNode = self.doc.store.rdf.createLiteral(d.toISOString(), triple.object.language, triple.object.datatype);
        }
        else {
          newNode = self.doc.store.rdf.createLiteral(newValue, triple.object.language, triple.object.datatype);
        }

        var newTriple = self.doc.store.rdf.createTriple(triple.subject, triple.predicate, triple.object);
        newTriple[field] = newNode;
        self.doc.updateTriple(triple, newTriple, function(success) {
          // do nothing
        }, function(msg) {
          $(self).trigger('rdf-editor-error', { message: 'Failed to update triple in document: ' + msg });
        });
      };

      container.empty();

      // create the basic entity editor layout using the template above
      container.append(self.template(self.predicate));

      var $list = $(document.createElement('table')).addClass('table');
      container.find('#predicateTable').append($list);

      // add click handlers to our buttons (we have three handlers because we used to have three buttons)
      var backButton = container.find('button#backButton');
      backButton.click(function() {
        backCallback();
      });

      var predicateEditor = container.find('select[name="predicate"]').propertyBox({
        ontoManager: self.ontologyManager
      });
      if (self.predicate) {
        predicateEditor.setPropertyURI(self.predicate.uri);
      }
      predicateEditor.sel.on('change', function(predicateUri) {
        if (predicateUri) {
          self.doc.getPredicate(predicateUri, function (predicate) {
            self.predicateView.addPredicate(predicate);

            self.predicate = predicate;
            self.renderData();
          });
        }
      });
      predicateEditorData(container, backCallback);
    };

    c.prototype.renderData = function() {
      var self = this;

      var predicates = (self.predicate) ? self.predicate.items : [];
      for(var i = 0; i < predicates.length; i++) {
        predicates[i].id = i;
      }
      self.predicateTable.data('maxindex', i);
      self.predicateTable.bootstrapTable('load', predicates);;
      if (self.predicate) {
        self.addButton.show();
      }
      else {
        self.addButton.hide();
      }
    },

    c.prototype.addTriple = function(triple) {
      var self = this;

      var i = self.predicateTable.data('maxindex');
      self.predicateTable.bootstrapTable('append', $.extend(triple, {
        id: i
      }));
      self.predicateTable.data('maxindex', ++i);
      self.predicateView.updatePredicate(self.predicate.uri);
    };

    c.prototype.createNewRelationEditor = function() {
      var self = this;

      self.predicateTableContainer.hide();
      self.predicateFormContainer.html(
        '<div class="panel panel-default"> ' +
        '  <div class="panel-heading"><h3 class="panel-title">Add Relation</h3></div> ' +
        '  <div class="panel-body"> ' +
        '    <form class="form-horizontal"> ' +
        '      <div class="form-group"> ' +
        '        <label for="subject" class="col-sm-2 control-label">' + RDFE.Utils.namingSchemaLabel('s', self.namingSchema) + '</label> ' +
        '        <div class="col-sm-10"><input name="subject" class="form-control" /></div> ' +
        '      </div> ' +
        '      <div class="form-group"> ' +
        '        <label for="object" class="col-sm-2 control-label">' + RDFE.Utils.namingSchemaLabel('o', self.namingSchema) + '</label> ' +
        '        <div class="col-sm-10"><input name="object" class="form-control" /></div> ' +
        '      </div> ' +
        '      <div class="form-group"> ' +
        '        <div class="col-sm-10 col-sm-offset-2"> ' +
        '          <button type="button" class="btn btn-default predicate-action predicate-action-new-cancel">Cancel</button> ' +
        '          <button type="button" class="btn btn-primary predicate-action predicate-action-new-save">OK</button> ' +
        '        </div> ' +
        '      </div> ' +
        '    </form> ' +
        '  </div> ' +
        '</div>'
      ).show();

      var property = self.ontologyManager.ontologyProperties[self.predicate.uri];
      var objectEditor = self.predicateFormContainer.find('input[name="object"]').rdfNodeEditor(self.doc.config.options);
      var node;
      var nodeItems;
      var range = property.getRange();
      if (objectEditor.isLiteralType(range)) {
        node = new RDFE.RdfNode('literal', '', range, '');
      }
      else if (self.ontologyManager.ontologyClassByURI(range)) {
        node = new RDFE.RdfNode('uri', '');
        nodeItems = self.doc.itemsByRange(range);
      }
      else {
        node = new RDFE.RdfNode('literal', '', null, '');
      }
      objectEditor.setValue(node, nodeItems);

      self.predicateFormContainer.find('button.predicate-action-new-cancel').click(function(e) {
        self.predicateFormContainer.hide();
        self.predicateTableContainer.show();
      });

      self.predicateFormContainer.find('button.predicate-action-new-save').click(function(e) {
        var s = self.predicateFormContainer.find('input[name="subject"]').val();
        s = RDFE.Utils.trim(RDFE.Utils.trim(s, '<'), '>')
        var p = self.predicate.uri;
        var o = objectEditor.getValue();
        var t = self.doc.store.rdf.createTriple(self.doc.store.rdf.createNamedNode(s), self.doc.store.rdf.createNamedNode(p), o.toStoreNode(self.doc.store));
        self.doc.addTriples([t], function() {
          self.addTriple(t);
          $(self).trigger('rdf-editor-success', {
            "type": "triple-insert-success",
            "message": "Successfully added new statement."
          });
          self.predicateFormContainer.hide();
          self.predicateTableContainer.show();
        }, function() {
          $(self).trigger('rdf-editor-error', {
            "type": 'triple-insert-failed',
            "message": "Failed to add new statement to store."
          });
        });
      });
    };

    return c;
  })();
})(jQuery);
