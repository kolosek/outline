// @flow
import * as Sentry from "@sentry/react";
import invariant from "invariant";
import { observable, action, computed, autorun, runInAction } from "mobx";
import { getCookie, setCookie, removeCookie } from "tiny-cookie";
import RootStore from "stores/RootStore";
import Policy from "models/Policy";
import Team from "models/Team";
import User from "models/User";
import env from "env";
import { client } from "utils/ApiClient";
import { getCookieDomain } from "utils/domains";

const AUTH_STORE = "AUTH_STORE";
const NO_REDIRECT_PATHS = ["/", "/create", "/home"];

type Service = {|
  id: string,
  name: string,
  authUrl: string,
|};

type Config = {|
  name?: string,
  hostname?: string,
  services: Service[],
|};

export default class AuthStore {
  @observable user: ?User;
  @observable team: ?Team;
  @observable token: ?string;
  @observable lastSignedIn: ?string;
  @observable isSaving: boolean = false;
  @observable isSuspended: boolean = false;
  @observable suspendedContactEmail: ?string;
  @observable config: ?Config;
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    // attempt to load the previous state of this store from localstorage
    let data = {};
    try {
      data = JSON.parse(localStorage.getItem(AUTH_STORE) || "{}");
    } catch (_) {
      // no-op Safari private mode
    }

    this.rehydrate(data);

    // persists this entire store to localstorage whenever any keys are changed
    autorun(() => {
      try {
        localStorage.setItem(AUTH_STORE, this.asJson);
      } catch (_) {
        // no-op Safari private mode
      }
    });

    // listen to the localstorage value changing in other tabs to react to
    // signin/signout events in other tabs and follow suite.
    window.addEventListener("storage", (event) => {
      if (event.key === AUTH_STORE) {
        const data = JSON.parse(event.newValue);

        // if there is no user on the new data then we know the other tab
        // signed out and we should do the same. Otherwise, if we're not
        // signed in then hydrate from the received data
        if (this.token && data.user === null) {
          this.logout();
        } else if (!this.token) {
          this.rehydrate(data);
        }
      }
    });
  }

  @action
  rehydrate(data: { user: User, team: Team }) {
    this.user = new User(data.user);
    this.team = new Team(data.team);
    this.token = getCookie("accessToken");
    this.lastSignedIn = getCookie("lastSignedIn");

    if (this.token) {
      setImmediate(() => this.fetch());
    }
  }

  addPolicies = (policies: Policy[]) => {
    if (policies) {
      policies.forEach((policy) => this.rootStore.policies.add(policy));
    }
  };

  @computed
  get authenticated(): boolean {
    return !!this.token;
  }

  @computed
  get asJson(): string {
    return JSON.stringify({
      user: this.user,
      team: this.team,
    });
  }

  @action
  fetchConfig = async () => {
    const res = await client.post("/auth.config");
    invariant(res && res.data, "Config not available");
    this.config = res.data;
  };

  @action
  fetch = async () => {
    try {
      const res = await client.post("/auth.info");
      invariant(res && res.data, "Auth not available");

      runInAction("AuthStore#fetch", () => {
        this.addPolicies(res.policies);
        const { user, team } = res.data;
        this.user = new User(user);
        this.team = new Team(team);

        if (env.SENTRY_DSN) {
          Sentry.configureScope(function (scope) {
            scope.setUser({ id: user.id });
            scope.setExtra("team", team.name);
            scope.setExtra("teamId", team.id);
          });
        }

        // If we came from a redirect then send the user immediately there
        const postLoginRedirectPath = getCookie("postLoginRedirectPath");
        if (postLoginRedirectPath) {
          removeCookie("postLoginRedirectPath");

          if (!NO_REDIRECT_PATHS.includes(postLoginRedirectPath)) {
            window.location.href = postLoginRedirectPath;
          }
        }
      });
    } catch (err) {
      if (err.error === "user_suspended") {
        this.isSuspended = true;
        this.suspendedContactEmail = err.data.adminEmail;
      }
    }
  };

  @action
  deleteUser = async () => {
    await client.post(`/users.delete`, { confirmation: true });

    runInAction("AuthStore#updateUser", () => {
      this.user = null;
      this.team = null;
      this.token = null;
    });
  };

  @action
  updateUser = async (params: { name?: string, avatarUrl: ?string }) => {
    this.isSaving = true;

    try {
      const res = await client.post(`/users.update`, params);
      invariant(res && res.data, "User response not available");

      runInAction("AuthStore#updateUser", () => {
        this.addPolicies(res.policies);
        this.user = new User(res.data);
      });
    } finally {
      this.isSaving = false;
    }
  };

  @action
  updateTeam = async (params: {
    name?: string,
    avatarUrl?: ?string,
    sharing?: boolean,
  }) => {
    this.isSaving = true;

    try {
      const res = await client.post(`/team.update`, params);
      invariant(res && res.data, "Team response not available");

      runInAction("AuthStore#updateTeam", () => {
        this.addPolicies(res.policies);
        this.team = new Team(res.data);
      });
    } finally {
      this.isSaving = false;
    }
  };

  @action
  logout = async (savePath: boolean = false) => {
    // remove user and team from localStorage
    localStorage.setItem(
      AUTH_STORE,
      JSON.stringify({
        user: null,
        team: null,
      })
    );

    this.token = null;

    // if this logout was forced from an authenticated route then
    // save the current path so we can go back there once signed in
    if (savePath) {
      const pathName = window.location.pathname;

      if (!NO_REDIRECT_PATHS.includes(pathName)) {
        setCookie("postLoginRedirectPath", pathName);
      }
    }

    // remove authentication token itself
    removeCookie("accessToken", { path: "/" });

    // remove session record on apex cookie
    const team = this.team;
    if (team) {
      const sessions = JSON.parse(getCookie("sessions") || "{}");
      delete sessions[team.id];

      setCookie("sessions", JSON.stringify(sessions), {
        domain: getCookieDomain(window.location.hostname),
      });
      this.team = null;
    }
  };
}
