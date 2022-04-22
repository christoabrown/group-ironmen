class Storage {
  storeGroup(groupName, groupToken) {
    localStorage.setItem("groupName", groupName);
    localStorage.setItem("groupToken", groupToken);
  }

  getGroup() {
    return {
      groupName: localStorage.getItem("groupName"),
      groupToken: localStorage.getItem("groupToken"),
    };
  }

  clearGroup() {
    localStorage.removeItem("groupName");
    localStorage.removeItem("groupToken");
  }
}

const storage = new Storage();

export { storage };
