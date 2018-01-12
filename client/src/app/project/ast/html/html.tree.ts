import * as parse5 from 'parse5';
import {doctype_serializeContent} from "./html.ser";

const DOCUMENT_MODE = {
  NO_QUIRKS: 'no-quirks',
  QUIRKS: 'quirks',
  LIMITED_QUIRKS: 'limited-quirks'
};


class Node {
  constructor(props) {
    for (let key in props) {
      if (props.hasOwnProperty(key))
        this[key] = props[key];
    }
  }
}


// Custom html adapter, w/no parent and prev/next attributes -- pure JSON.
// Cannot use with parse5 dom parser because that calls detachNode several places.
export class SimpleHtmlAdapter /*implements parse5.AST.TreeAdapter*/ {

  // crs added functions
  static deleteChild(parentNode, child) {
    let index = parentNode.children.indexOf(child);
    parentNode.children.splice(index, 1);
  }

  //Node construction
  static createDocument() {
    return new Node({
      type: 'root',
      name: 'root',
      children: [],
      'x-mode': DOCUMENT_MODE.NO_QUIRKS
    });
  };

  static createDocumentFragment() {
    return new Node({
      type: 'root',
      name: 'root',
      children: []
    });
  };

  static createElement(tagName, namespaceURI, attrs) {
    let attribs = Object.create(null),
      attribsNamespace = Object.create(null),
      attribsPrefix = Object.create(null);

    for (let i = 0; i < attrs.length; i++) {
      let attrName = attrs[i].name;

      attribs[attrName] = attrs[i].value;
      attribsNamespace[attrName] = attrs[i].namespace;
      attribsPrefix[attrName] = attrs[i].prefix;
    }

    return new Node({
      type: tagName === 'script' || tagName === 'style' ? tagName : 'tag',
      name: tagName,
      namespace: namespaceURI,
      attribs: attribs,
      'x-attribsNamespace': attribsNamespace,
      'x-attribsPrefix': attribsPrefix,
      children: [],
    });
  };

  static createCommentNode(data) {
    return new Node({
      type: 'comment',
      data: data,
    });
  };

  static createTextNode(value) {
    return new Node({
      type: 'text',
      data: value,
    });
  };

  //Tree mutation
  static appendChild(parentNode, newNode) {
    parentNode.children.push(newNode);
  };

  static insertBefore(parentNode, newNode, referenceNode) {
    let insertionIdx = parentNode.children.indexOf(referenceNode);
    parentNode.children.splice(insertionIdx, 0, newNode);
  };

  static setTemplateContent(templateElement, contentElement) {
    this.appendChild(templateElement, contentElement);
  };

  static getTemplateContent(templateElement) {
    return templateElement.children[0];
  };

  static setDocumentType(document, name, publicId, systemId) {
    let data = doctype_serializeContent(name, publicId, systemId),
      doctypeNode = null;

    for (let i = 0; i < document.children.length; i++) {
      if (document.children[i].type === 'directive' && document.children[i].name === '!doctype') {
        doctypeNode = document.children[i];
        break;
      }
    }

    if (doctypeNode) {
      doctypeNode.data = data;
      doctypeNode['x-name'] = name;
      doctypeNode['x-publicId'] = publicId;
      doctypeNode['x-systemId'] = systemId;
    }

    else {
      this.appendChild(document, new Node({  // crs: this.
        type: 'directive',
        name: '!doctype',
        data: data,
        'x-name': name,
        'x-publicId': publicId,
        'x-systemId': systemId
      }));
    }

  };

  static setDocumentMode(document, mode) {
    document['x-mode'] = mode;
  };

  static getDocumentMode(document) {
    return document['x-mode'];
  };

  static detachNode(node) {
    // Called by parse5's parseFragment / _adoptNodes, so cannot throw.
    // But if you don't throw, then you get infinite loop in their dom parser.
    throw new Error('Cannot implement detachNode');
  };

  static insertText(parentNode, text) {
    let lastChild = parentNode.children[parentNode.children.length - 1];

    if (lastChild && lastChild.type === 'text')
      lastChild.data += text;
    else
      this.appendChild(parentNode, this.createTextNode(text));
  };

  static insertTextBefore(parentNode, text, referenceNode) {
    let prevNode = parentNode.children[parentNode.children.indexOf(referenceNode) - 1];

    if (prevNode && prevNode.type === 'text')
      prevNode.data += text;
    else
      this.insertBefore(parentNode, this.createTextNode(text), referenceNode);
  };

  static adoptAttributes(recipient, attrs) {
    for (let i = 0; i < attrs.length; i++) {
      let attrName = attrs[i].name;

      if (typeof recipient.attribs[attrName] === 'undefined') {
        recipient.attribs[attrName] = attrs[i].value;
        recipient['x-attribsNamespace'][attrName] = attrs[i].namespace;
        recipient['x-attribsPrefix'][attrName] = attrs[i].prefix;
      }
    }
  };

  // Tree traversing
static getFirstChild(node) {
    return node.children[0];
};

static getChildNodes(node) {
    return node.children;
};

static getParentNode(node) {
  // This is called by pare5's _findFormInFragmentContext, so we cannot make it throw exception.
  // throw new Error('Cannot implement getParentNode');
  return null;
};

static getAttrList(element) {
    let attrList = [];

    for (let name in element.attribs) {
        attrList.push({
            name: name,
            value: element.attribs[name],
            namespace: element['x-attribsNamespace'][name],
            prefix: element['x-attribsPrefix'][name]
        });
    }

    return attrList;
};



  //Node data
  static getTagName(element) {
    return element.name;
  };

  static getNamespaceURI(element) {
    return element.namespace;
  };

  static getTextNodeContent(textNode) {
    return textNode.data;
  };

  static getCommentNodeContent(commentNode) {
    return commentNode.data;
  };

  static getDocumentTypeNodeName(doctypeNode) {
    return doctypeNode['x-name'];
  };

  static getDocumentTypeNodePublicId(doctypeNode) {
    return doctypeNode['x-publicId'];
  };

  static getDocumentTypeNodeSystemId(doctypeNode) {
    return doctypeNode['x-systemId'];
  };

  //Node types
  static isTextNode(node) {
    return node.type === 'text';
  };

  static isCommentNode(node) {
    return node.type === 'comment';
  };

  static isDocumentTypeNode(node) {
    return node.type === 'directive' && node.name === '!doctype';
  };

  static isElementNode(node) {
    return !!node.attribs;
  };

}
